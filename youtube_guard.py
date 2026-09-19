"""Durable caption cache and one request budget shared by every local process.

No requests are scheduled here. A cooldown expiry permits a future explicit
request; it is not evidence that YouTube has lifted its restriction.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from datetime import datetime, timezone

DEFAULT_DB = Path.home() / '.local/share/dictai/youtube-captions.sqlite3'
MIN_INTERVAL = 60
HOURLY_LIMIT = 10
BLOCK_SECONDS = 24 * 60 * 60
LEASE_SECONDS = 60  # Upstream subprocess is terminated after 45 seconds.
JOIN_SECONDS = 47


class CaptionGuard:
    def __init__(self, path=None, clock=time.time):
        self.path = Path(path or os.environ.get('DICTAI_YOUTUBE_CACHE_DB', DEFAULT_DB))
        self.clock = clock

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        db.execute('CREATE TABLE IF NOT EXISTS captions (key TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at REAL NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS failures (key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires REAL NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS request_guard (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)')
        return db

    @staticmethod
    def _state(db):
        row = db.execute('SELECT payload FROM request_guard WHERE id=1').fetchone()
        return json.loads(row[0]) if row else {}

    @staticmethod
    def _write(db, state):
        db.execute('INSERT OR REPLACE INTO request_guard VALUES (1,?)', (json.dumps(state),))

    @staticmethod
    def key(video_id, language):
        return json.dumps([video_id, language], separators=(',', ':'))

    def _paused(self, state, now):
        until = state.get('blocked_until', 0)
        timestamp = datetime.fromtimestamp(until, timezone.utc).isoformat()
        return {'error':'requests_paused', 'message':f'YouTube blocked caption requests. New requests are paused until {timestamp}. This is a local waiting period, not a confirmed unblock time. Saved captions and SRT / VTT still work.', 'retry_after':max(1, int(until-now+1)), 'blocked_until':until, 'cause':state.get('blocked_reason', 'RequestBlocked')}

    def status(self):
        db = self.connect()
        try:
            state = self._state(db)
            now = self.clock()
            return {'paused':state.get('blocked_until',0)>now, 'blocked_until':state.get('blocked_until'), 'reason':state.get('blocked_reason'), 'next_request_at':state.get('next_at',0), 'cached_transcripts':db.execute('SELECT COUNT(*) FROM captions').fetchone()[0], 'minimum_interval_seconds':MIN_INTERVAL, 'hourly_limit':HOURLY_LIMIT}
        finally:
            db.close()

    def pause(self, reason='IpBlocked'):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            state = self._state(db)
            state.update(blocked_reason=reason, blocked_until=max(state.get('blocked_until',0), self.clock()+BLOCK_SECONDS))
            self._write(db,state)
            db.commit()
        finally:
            db.close()

    def save(self, video_id, language, payload):
        db = self.connect()
        try:
            db.execute('INSERT OR REPLACE INTO captions VALUES (?,?,?)', (self.key(video_id, language),json.dumps(payload,ensure_ascii=False),self.clock()))
        finally:
            db.close()

    def _claim(self, key):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            now = self.clock()
            cached = db.execute('SELECT payload FROM captions WHERE key=?',(key,)).fetchone()
            if cached:
                return 'result', {**json.loads(cached[0]),'cached':True}
            state = self._state(db)
            if state.get('blocked_until',0)>now:
                return 'result', self._paused(state,now)
            failed = db.execute('SELECT payload FROM failures WHERE key=? AND expires>?',(key,now)).fetchone()
            if failed:
                return 'result', json.loads(failed[0])
            if state.get('lease_until',0)>now:
                if state.get('active_key')==key:
                    return 'join', None
                return 'result', {'error':'request_busy','message':'Another caption request is already running. No extra request was sent.','retry_after':max(1,int(state['lease_until']-now+1))}
            recent = [stamp for stamp in state.get('recent',[]) if stamp>now-3600]
            next_at = max(state.get('next_at',0), recent[0]+3600 if len(recent)>=HOURLY_LIMIT else 0)
            if next_at>now:
                wait=max(1,int(next_at-now+1))
                return 'result', {'error':'request_rate_limited','message':f'Caption requests are limited to protect access. Try again in {wait} seconds. Saved captions still work.','retry_after':wait}
            token = uuid.uuid4().hex
            state.update(active_key=key,token=token,lease_until=now+LEASE_SECONDS,next_at=now+MIN_INTERVAL,recent=recent+[now])
            self._write(db,state)
            db.commit()
            return 'fetch',token
        finally:
            db.close()  # Uncommitted read-only paths release their transaction.

    def _finish(self, key, token, result):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            now = self.clock()
            state = self._state(db)
            if state.get('token') != token:
                return {'error':'request_expired','message':'The caption request expired. No automatic retry was sent.'}
            state.update(lease_until=0,active_key=None,token=None)
            if result.get('error') in ('IpBlocked','RequestBlocked'):
                state.update(blocked_until=now+BLOCK_SECONDS,blocked_reason=result['error'])
                result=self._paused(state,now)
            if 'error' in result:
                db.execute('INSERT OR REPLACE INTO failures VALUES (?,?,?)',(key,json.dumps(result),now+MIN_INTERVAL))
            else:
                db.execute('INSERT OR REPLACE INTO captions VALUES (?,?,?)',(key,json.dumps(result,ensure_ascii=False),now))
            self._write(db,state)
            db.commit()
            return result
        finally:
            db.close()

    def get(self, video_id, language, fetcher):
        key = self.key(video_id,language)
        deadline = time.monotonic()+JOIN_SECONDS
        while True:
            try:
                action, value = self._claim(key)
                if action=='result': return value
                if action=='join':
                    if time.monotonic()>=deadline:
                        return {'error':'request_busy','message':'The existing caption request is still running. No duplicate request was sent.','retry_after':15}
                    time.sleep(.1)
                    continue
                try:
                    result=fetcher()
                except Exception:
                    result={'error':'import_failed','message':'The caption request failed. No automatic retry was sent.'}
                return self._finish(key,value,result)
            except (sqlite3.Error,OSError,ValueError):
                # Fail closed: never contact YouTube without a working guard.
                return {'error':'cache_unavailable','message':'Caption storage is unavailable. New requests are stopped to prevent repeated downloads.'}

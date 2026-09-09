# Caption request protection

## One budget for production, preview and research

`youtube_guard.py` uses a dedicated SQLite file at `~/.local/share/dictai/youtube-captions.sqlite3` (override with `DICTAI_YOUTUBE_CACHE_DB`). It is separate from Book/Conversation progress. All instances under the same server account share the same default path. The CLI and audit tool enter the same guard as `/api/youtube/import`.

- Successful captions are persisted by video ID and requested language, with no automatic expiry or refresh. Restarting either service does not discard them. URL start times are applied after lookup and do not create another download.
- Uploaded SRT/VTT is also retained. Already browser-saved transcripts remain available in the existing client; older RAM-only server entries lost before this change cannot be retroactively recovered.
- A transactional cross-process lease allows one upstream caption job at a time. Six simultaneous requests for the same video join one result. Other videos receive a local busy response instead of another queued download.
- New jobs are spaced at least **60 seconds** apart, with at most **10 starts per rolling hour**, including failures. These are conservative local limits, not documented YouTube allowances or guarantees against blocking.
- `IpBlocked` or `RequestBlocked` opens a durable **24-hour pause** shared across all videos and instances. Saved captions remain available. Restart and repeated clicks do not reset the pause.
- No retry, probe, automatic unblocking or background timer calls YouTube. After the pause, only a later explicit request may try again. Another block renews the pause. The local deadline is **not** a claim about YouTube's restriction expiry.
- Errors are briefly cached so joined/repeated failures cannot immediately trigger another job. A crashed job's 60-second lease expires; the worker has a 45-second termination deadline.
- Storage failure is fail-closed for upstream requests. Manual uploaded captions can still be used without a working disk cache.

`GET /api/youtube/status` reports only local state and cache count; it makes no external request. Paused/busy/rate-limited responses use HTTP 429 and `Retry-After`. The existing frontend displays the returned explanation. The research CLI stops on pause, busy, rate-limit or cache errors rather than marching through the remaining video list.

The private `--fetch-worker` child is launched only after the parent acquires the shared lease. Development/research callers must use the normal CLI or `fetch_guarded`, not the low-level worker/fetch function.

## Verification

`tests/test_youtube_guard.py` checks persistence, interval/hour budgets, cross-process duplicate suppression, pause persistence, cache access during pause, no scheduled retry at expiry, negative caching, worker failure/crash recovery and fail-closed storage. All upstream calls are simulated. `tests/test_youtube.py` additionally checks API status/headers, manual imports during pause and Book progress isolation with temporary databases.

Deployment seeds the known existing IP block into the persistent pause without making a test request to YouTube. No proxy, IP rotation, cookie extraction, alternate access route, media download or GPU job is introduced.

"""Read public captions using the existing importer; retain only compact evidence."""
import argparse, json, re, subprocess, sys
from pathlib import Path

videos = ['hVimVzgtD6w','OT9poH_D2Iw','spUNpyF58BY','aircAruvnKk','IlU-zDU6aQ0','T7M3PpjBZzw','48h57PspBec','rDrw3kkqKac','Ufe0B6cG9gg','eIrMbAQSU34','H14bBuluwB8','8S0FDjFBj8o','iG9CE55wbtY','arj7oStGLkU','iCvmsMzlF7o','qp0HIF3SfI4','RcGyVTAoXEU','j0wJBEZdwLs','jNQXAC9IVRw','Ak22eaBVPXs']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',required=True,help='New output JSON path; existing files are not overwritten')
parser.add_argument('videos',nargs='*')
args=parser.parse_args()
videos = args.videos or videos
destination=Path(args.output)
if destination.exists():raise SystemExit('Output already exists; choose another path.')
patterns = {
 'digits':r'\b\d[\d,]*(?:\.\d+)?\b',
 'currency':r'[$£€]\s*\d[\d,.]*|\b(?:dollars?|cents?|pounds?|euros?)\b',
 'percent':r'\d+(?:\.\d+)?%|\bper\s*cent\b|\bpercent(?:age)?\b',
 'time':r'\b\d{1,2}:\d{2}\b|\b[ap]\.m\.|\bo.clock\b',
 'ordinal':r'\b\d+(?:st|nd|rd|th)\b|\b(?:first|second|third|twentieth)\b',
 'decimal':r'\b\d+\.\d+\b|\bpoint\s+(?:zero|one|two|three|four|five|six|seven|eight|nine)\b',
 'scale':r'\b(?:hundred|thousand|million|billion|trillion)\b',
 'abbreviation':r'\b[A-Z]{2,6}\b|\b(?:Mr|Mrs|Dr|St)\.',
 'contraction':r"\b\w+(?:n't|'re|'ve|'ll|'d|'s)\b",
 'fraction':r'\b\d+/\d+\b|\b(?:half|quarter|thirds|quarters)\b',
 'units':r'\b(?:kilometers?|kilometres?|kilograms?|mph|km|kg|degrees?|celsius|fahrenheit)\b',
}
records=[]
for vid in videos:
 try:
  p=subprocess.run([sys.executable,'youtube_api.py',vid,'en'],capture_output=True,text=True,timeout=48,check=True)
  data=json.loads(p.stdout)
  if 'error' in data:
   records.append({'id':vid,'error':data['error']});print(vid,data['error'],flush=True)
   if data['error'] in ('IpBlocked','RequestBlocked','requests_paused','request_rate_limited','request_busy','cache_unavailable'):
    records.extend({'id':remaining,'error':'NotAttemptedAfterRequestGuard'} for remaining in videos[len(records):]);break
   continue
  segments=data['segments'];text=' '.join(s['text'] for s in segments)
  counts={k:len(re.findall(v,text,re.I if k!='abbreviation' else 0)) for k,v in patterns.items()}
  evidence=[];budget=24
  for kind,pat in patterns.items():
   for seg in segments:
    m=re.search(pat,seg['text'],re.I if kind!='abbreviation' else 0)
    if m:
     phrase=m.group();n=len(phrase.split())
     if n<=budget:evidence.append({'kind':kind,'at':seg['start'],'text':phrase});budget-=n
     break
  row={'id':vid,'url':'https://www.youtube.com/watch?v='+vid,'title':data['title'],'generated':data['generated'],'clips':len(segments),'words':len(text.split()),'counts':counts,'examples':evidence}
  records.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 except Exception as e:records.append({'id':vid,'error':type(e).__name__});print(vid,type(e).__name__,flush=True)
with destination.open('x') as output:json.dump(records,output,indent=2,ensure_ascii=False)
print('AUDIT COMPLETE',sum('counts' in r for r in records),'/',len(records),flush=True)

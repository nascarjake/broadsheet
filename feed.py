"""Bounded, fixed-source RSS adapter. Headlines + brief feed excerpts only."""
import urllib.request, xml.etree.ElementTree as ET, html, re, json, hashlib
from datetime import datetime, timezone
from pathlib import Path
URL='https://www.nasa.gov/feed/'
DEST=Path(__file__).parent/'dist'/'feed.json'
def plain(s):
 return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s or ''))).strip()
def topic(title):
 t=title.lower()
 if any(k in t for k in ['earth','climate','ocean','weather','hurricane','landsat','wildfire','utah','city lights']): return 'Earth & environment'
 if any(k in t for k in ['astronaut','artemis','station','crew','human','orion','moon','lunar']): return 'Human frontiers'
 if any(k in t for k in ['engine','robot','technology','aircraft','software','innovation','flight','aviation','drone','supercomput']): return 'Ideas & engineering'
 return 'The universe'
def parse(data):
 if len(data)>5_000_000: raise ValueError('Feed exceeds size limit')
 if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper(): raise ValueError('XML entities are not supported')
 root=ET.fromstring(data); stories=[]
 for item in root.findall('./channel/item')[:32]:
  title=plain(item.findtext('title')); link=item.findtext('link','').strip()
  if title.startswith('APOD:'): continue
  if not title or not link.startswith(('https://','http://')): continue
  desc=plain(item.findtext('description'))
  stories.append({'id':str(len(stories)+1),'title':title,'url':link,'excerpt':(desc[:900].rsplit(' ',1)[0]+'…') if len(desc)>900 else desc,'date':item.findtext('pubDate',''),'topic':topic(title),'source':'NASA'})
 if not stories: raise ValueError('No usable RSS stories')
 return stories
def refresh():
 req=urllib.request.Request(URL,headers={'User-Agent':'SpatialBroadsheetPrototype/0.1 (local RSS reader)'})
 with urllib.request.urlopen(req,timeout=15) as r: stories=parse(r.read(5_000_001))
 try:
  with urllib.request.urlopen('https://www.nasa.gov/news-release/feed/',timeout=15) as r: extra=parse(r.read(5_000_001))
  urls={s['url'] for s in stories}; stories.extend(s for s in extra if s['url'] not in urls)
 except Exception: pass
 for i,s in enumerate(stories):
  s['order']=i+1; s['id']=hashlib.sha256(s['url'].encode()).hexdigest()[:12]
 result={'retrievedAt':datetime.now(timezone.utc).isoformat(),'feed':URL,'stories':stories}
 DEST.write_text(json.dumps(result,indent=2)); return result
if __name__=='__main__':
 r=refresh(); print(f"Saved {len(r['stories'])} source-linked stories")

"""Bounded RSS/Atom aggregation from an explicit source catalog; no open proxy."""
import urllib.request, xml.etree.ElementTree as ET, html, re, json, hashlib, os, ssl
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT = Path(__file__).parent / 'dist'
URL = 'https://www.nasa.gov/feed/'
DEST = ROOT / 'feed.json'
MAX_BYTES = 5_000_000

def tls_context():
    # python.org macOS installs may lack a default CA file; retain TLS verification.
    if not ssl.get_default_verify_paths().cafile and Path("/etc/ssl/cert.pem").exists():
        return ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return ssl.create_default_context()

def plain(s):
    s = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', s or '', flags=re.I | re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

def topic(title):
    t = title.lower()
    if any(k in t for k in ['earth','climate','ocean','weather','hurricane','landsat','wildfire','utah','city lights']): return 'Earth & environment'
    if any(k in t for k in ['astronaut','artemis','station','crew','human','orion','moon','lunar']): return 'Human frontiers'
    if any(k in t for k in ['engine','robot','technology','aircraft','software','innovation','flight','aviation','drone','supercomput']): return 'Ideas & engineering'
    return 'The universe'

def tags_for(title, defaults):
    tags = set(defaults)
    for label, pattern in [('AI',r'\b(ai|artificial intelligence|machine learning|llm|openai|chatgpt)\b'),('Space',r'\b(nasa|spacecraft|spaceflight|space exploration|space mission|lunar|astronaut|artemis|orbit|galaxy|galaxies|telescope)\b'),('Climate',r'\b(climate|emissions|warming|wildfire|renewable)\b'),('Technology',r'\b(software|technology|tech|chip|chips|cyber|computing)\b'),('Cooking',r'\b(recipe|recipes|cooking|chef|baking)\b')]:
        if re.search(pattern, title, re.I): tags.add(label)
    return sorted(tags)

def parse(data, source=None):
    if len(data) > MAX_BYTES: raise ValueError('Feed exceeds size limit')
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper(): raise ValueError('XML entities are not supported')
    root = ET.fromstring(data)
    ns = {'a':'http://www.w3.org/2005/Atom'}
    atom = root.tag == '{http://www.w3.org/2005/Atom}feed'
    items = root.findall('a:entry', ns) if atom else root.findall('./channel/item')
    if not items: items = root.findall('{http://purl.org/rss/1.0/}item')
    stories = []
    def field(item, name):
        return item.findtext(('a:' if atom else '') + name, '', ns)
    for item in items[:40]:
        title = plain(field(item, 'title'))
        if atom:
            link = next((x.get('href','') for x in item.findall('a:link',ns) if x.get('rel','alternate') == 'alternate'), '')
        else: link = field(item, 'link').strip()
        if source and source['id']=='nasa' and title.startswith('APOD:'): continue
        if not title or not link.startswith(('https://','http://')): continue
        desc = plain(field(item, 'summary' if atom else 'description'))
        raw_date = field(item, 'published') or field(item, 'updated') if atom else field(item, 'pubDate')
        try:
            dt = datetime.fromisoformat(raw_date.replace('Z','+00:00')) if atom else parsedate_to_datetime(raw_date)
            raw_date = dt.replace(tzinfo=dt.tzinfo or timezone.utc).isoformat()
        except (ValueError, TypeError, OverflowError): raw_date = ''
        s = {'id':hashlib.sha256(link.encode()).hexdigest()[:16], 'title':title, 'url':link,
             'excerpt':desc[:350].rsplit(' ',1)[0]+'…' if len(desc)>350 else desc,
             'date':raw_date, 'topic':topic(title), 'source':source['name'] if source else 'NASA',
             'sourceId':source['id'] if source else 'nasa', 'topics':tags_for(title, source['topics'] if source else ['Space','Science'])}
        from news_media import extract,location
        s['media']=[] if source and source.get('textOnly') else extract(item,link,s['source'])
        s['location']=location(item)
        s['author']=plain(item.findtext('{http://purl.org/dc/elements/1.1/}creator','') or field(item,'author') or (item.findtext('a:author/a:name','',ns) if atom else ''))[:200]
        s['sections']=[plain(n.text)[:80] for n in item.findall('category') if plain(n.text)][:8]
        s['contentNote']='Publisher feed excerpt; full reporting and media remain with the publisher.'
        stories.append(s)
    if not stories: raise ValueError('No usable RSS or Atom stories')
    return stories

def refresh():
    sources = json.loads((ROOT/'sources.json').read_text())
    try: previous = json.loads(DEST.read_text())
    except (FileNotFoundError, ValueError): previous = {}
    prior_status = {s['id']:s for s in previous.get('sources',[])}
    def fetch(source):
        try:
            req = urllib.request.Request(source['feed'], headers={'User-Agent':'Broadsheet/0.3 (personal RSS reader)','Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'})
            with urllib.request.urlopen(req, timeout=18, context=tls_context()) as response:
                stories = parse(response.read(MAX_BYTES+1), source)
            if source['id']=='nasa':
                try:stories.extend(nasa_videos())
                except Exception:stories.extend(s for s in previous.get('stories',[]) if s.get('mediaOrigin')=='NASA Image and Video Library')
            return stories, {'id':source['id'],'status':'ok','retrievedAt':datetime.now(timezone.utc).isoformat(),'count':len(stories)}
        except Exception:
            stories = [s for s in previous.get('stories',[]) if s.get('sourceId') == source['id']]
            return stories, {'id':source['id'],'status':'stale' if stories else 'unavailable','retrievedAt':prior_status.get(source['id'],{}).get('retrievedAt'), 'count':len(stories)}
    results = list(ThreadPoolExecutor(max_workers=6).map(fetch,sources))
    stories = list({s['url']:s for batch,_ in results for s in batch}.values())
    result = {'retrievedAt':datetime.now(timezone.utc).isoformat(),'sources':[status for _,status in results], 'stories':stories}
    # Never replace the saved edition with a completely failed refresh.
    if not any(status['status']=='ok' for _,status in results): raise ValueError('All feeds unavailable; saved edition retained')
    temporary = DEST.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result,indent=2,ensure_ascii=False)); os.replace(temporary,DEST)
    return result

def nasa_videos():
    from urllib.parse import quote
    from news_media import public_url
    year=datetime.now(timezone.utc).year
    endpoint=f'https://images-api.nasa.gov/search?media_type=video&year_start={year}&page_size=50'
    req=urllib.request.Request(endpoint,headers={'User-Agent':'Broadsheet/0.8 (personal media reader)'})
    with urllib.request.urlopen(req,timeout=18,context=tls_context()) as r:data=json.loads(r.read(MAX_BYTES+1))
    rows=sorted(data.get('collection',{}).get('items',[]),key=lambda item:item.get('data',[{}])[0].get('date_created',''),reverse=True)[:6]
    def one(item):
        meta=item['data'][0];nasa_id=meta['nasa_id'];url='https://images.nasa.gov/details/'+quote(nasa_id,safe='')
        assets=public_url(item.get('href'));poster=next((public_url(i.get('href')) for i in item.get('links',[]) if i.get('render')=='image'),'')
        if not assets.startswith('https://images-assets.nasa.gov/'):return None
        with urllib.request.urlopen(urllib.request.Request(quote(assets,safe=':/?=&%'),headers={'User-Agent':'Broadsheet/0.8'}),timeout=15,context=tls_context()) as r:files=json.loads(r.read(300000))
        clips=[public_url(f) for f in files if isinstance(f,str) and f.lower().endswith('.mp4') and public_url(f).startswith('https://images-assets.nasa.gov/')]
        if not clips:return None
        clips.sort(key=lambda f:next((i for i,key in enumerate(['~mobile','~small','~medium','~720p','~orig']) if key in f),9))
        credit=plain(meta.get('secondary_creator') or meta.get('center') or 'NASA Image and Video Library')
        return {'id':'nasa-video-'+hashlib.sha256(nasa_id.encode()).hexdigest()[:12],'sourceId':'nasa','source':'NASA','title':plain(meta.get('title')),'url':url,'date':meta.get('date_created',''),'excerpt':plain(meta.get('description'))[:350],'topics':['Space','Science'],'mediaOrigin':'NASA Image and Video Library','media':[{'type':'image','src':poster,'width':800,'height':450,'credit':credit,'sourceUrl':url,'origin':'NASA Image and Video Library'},{'type':'video','provider':'NASA','src':clips[0],'url':url,'poster':poster,'credit':credit,'sourceUrl':url,'origin':'NASA Image and Video Library'}],'contentNote':'NASA video-library metadata; date is the library publication date.','rights':'Media supplied by the NASA Image and Video Library; original credits and source retained.','rightsUrl':'https://www.nasa.gov/nasa-brand-center/images-and-media/'}
    def safe_one(item):
        try:return one(item)
        except Exception:return None
    with ThreadPoolExecutor(max_workers=3) as pool:result=list(pool.map(safe_one,rows))
    return [s for s in result if s]

if __name__ == '__main__':
    result = refresh()
    print(f"Saved {len(result['stories'])} stories from {sum(s['status']=='ok' for s in result['sources'])} feeds")
    for s in result['sources']: print(s['id'],s['status'],s['count'])

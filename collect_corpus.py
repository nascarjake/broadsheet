"""Build a bounded NASA-authored reading corpus. No third-party imagery is reused.
Requires lxml and Pillow for this development-time curation step, not to run the reader.
NASA informational-use guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
"""
import json,re,hashlib,urllib.request,urllib.parse,io,time
from datetime import datetime,timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from lxml import html
from PIL import Image
from feed import topic
ROOT=Path(__file__).parent
IMAGES=ROOT/'dist/images/corpus';IMAGES.mkdir(parents=True,exist_ok=True)
GUIDANCE='https://www.nasa.gov/nasa-brand-center/images-and-media/'
def plain(e):return re.sub(r'\s+',' ',e.text_content()).strip()
def safe_credit(c):
 return bool(re.match(r'^(?:Credit[s]?:\s*)?NASA(?:$|/|\s)',c,re.I)) and not re.search(r'ESA|Caltech|SpaceX|Boeing|Northrop|Lockheed|University|Blue Origin|Axiom|©|copyright|Getty|AP\b|Reuters|Sierra|Intuitive',c,re.I)
def image_block(img):
 container=img
 for _ in range(8):
  container=container.getparent()
  if container is None:return None
  credits=container.xpath('.//*[contains(@class,"hds-credits")]')
  if len(credits)==1:break
  if len(credits)>1:return None
 if not credits:return None
 credit=plain(credits[0])
 if not safe_credit(credit):return None
 src=img.get('src','')
 if not src.startswith('https://') or not re.search(r'^https://(?:[\w-]+\.)*nasa.gov/',src):return None
 captions=container.xpath('.//*[contains(@class,"hds-caption-text")]')
 return {'type':'image','url':src,'src':src,'caption':plain(captions[0]) if captions else img.get('alt',''),'alt':img.get('alt',''),'credit':credit,'rightsUrl':GUIDANCE}
def parse_post(post):
 d=html.fragment_fromstring(post['content']['rendered'],create_parent='div')
 blocks=[]; seen=set();imcount=0
 for el in d:
  cls=el.get('class','')
  if any(x in cls for x in ['related-articles','topic-cards','credits-and-details','about-the-author']):continue
  if el.tag in ['p','h2','h3','h4','ul','ol','blockquote']:
   text=plain(el)
   if not text:continue
   if el.tag in ['ul','ol']:
    for li in el.xpath('./li'):blocks.append({'type':'paragraph','text':'• '+plain(li)})
   else:blocks.append({'type':'heading' if el.tag.startswith('h') else 'paragraph','text':text})
  elif any(x in cls for x in ['wp-block-image','image-carousel','article-hero-header']):
   for im in el.xpath('.//img'):
    b=image_block(im)
    if b and b['url'] not in seen and imcount<3:
     seen.add(b['url']);blocks.append(b);imcount+=1
  elif 'wp-block-nasa-blocks-blockquote' in cls:
   if plain(el):blocks.append({'type':'paragraph','text':plain(el)})
  elif el.tag=='div' and 'wp-block-group' in cls:
   for p in el.xpath('.//p|.//h2|.//h3'):
    t=plain(p)
    if t:blocks.append({'type':'heading' if p.tag.startswith('h') else 'paragraph','text':t})
 paragraphs=[b['text'] for b in blocks if b['type']=='paragraph'];words=sum(len(t.split()) for t in paragraphs)
 if words<200 or not imcount:return None
 title=html.fromstring(post['title']['rendered']).text_content() if '<' in post['title']['rendered'] else __import__('html').unescape(post['title']['rendered'])
 if any(x in title.lower() for x in ['design challenge','engineering challenge','en español']):return None
 author=d.xpath('.//*[contains(@class,"hds-about-the-author")]')
 return {'id':'nasa-'+str(post['id']),'title':title,'date':post.get('date_gmt',post['date'])+'Z','url':post['link'],'source':'NASA','topic':topic(title),'excerpt':paragraphs[0],'blocks':blocks,'wordCount':words,'readingMinutes':max(1,round(words/220)),'rights':'NASA-authored informational material; attribution retained. Selected NASA-credited images only.','rightsUrl':GUIDANCE,'contentNote':'Complete article prose; navigation, contact widgets, videos and unlicensed images omitted. Up to three credited illustrations retained.','authorNote':plain(author[0]) if author else 'NASA editorial source'}
def download(b):
 name=hashlib.sha256(b['url'].encode()).hexdigest()[:16]+'.jpg';target=IMAGES/name
 try:
  if not target.exists():
   req=urllib.request.Request(urllib.parse.quote(b['url'],safe=':/?=&%'),headers={'User-Agent':'BroadsheetPrototype/0.2 (informational NASA reader)'})
   with urllib.request.urlopen(req,timeout=30) as r:data=r.read(16_000_001)
   if len(data)>16_000_000:raise ValueError('image too large')
   im=Image.open(io.BytesIO(data)).convert('RGB');im.thumbnail((900,700));im.save(target,'JPEG',quality=78,optimize=True)
  b['src']='images/corpus/'+name
  with Image.open(target) as im:b['width'],b['height']=im.size
 except Exception as e:
  b['failed']=str(e); print('image skipped',str(e),b['url'],flush=True)
def source_posts(refresh=False):
 cache=Path('/tmp/nasa-posts-all.json')
 science_cache=Path('/tmp/nasa-science-posts.json')
 if refresh or not cache.exists():
  all_posts=[]
  for page in range(1,7):
   url=f'https://www.nasa.gov/wp-json/wp/v2/posts?per_page=50&page={page}&_embed=1'
   with urllib.request.urlopen(url,timeout=30) as response:all_posts.extend(json.load(response))
  cache.write_text(json.dumps(all_posts))
 if refresh or not science_cache.exists():
  with urllib.request.urlopen('https://science.nasa.gov/wp-json/wp/v2/posts?per_page=30&_embed=1',timeout=30) as response:science_cache.write_text(json.dumps(json.load(response)))
 return json.loads(cache.read_text())
if __name__=='__main__':
 import sys
 posts=source_posts('--refresh' in sys.argv)
 science=json.load(open('/tmp/nasa-science-posts.json')) if Path('/tmp/nasa-science-posts.json').exists() else []
 stories=[];seen=set()
 for p in posts:
  if p['id'] in seen:continue
  seen.add(p['id']);s=parse_post(p)
  if s:stories.append(s)
 stories=stories[:48]
 for p in science:
  if any(x in p['title']['rendered'] for x in ['Skywatching','Supercomputing']):continue
  s=parse_post(p)
  if s and s['id'] not in {t['id'] for t in stories}:
   s['topic']='Earth & environment' if any(x in s['title'] for x in ['Cyprus','Ozone','Pennsylvania','Vega Island']) else s['topic']
   stories.append(s)
 print('qualified',len(stories),flush=True)
 images=[b for s in stories for b in s['blocks'] if b['type']=='image']
 with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(download,images))
 for s in stories:
  s['blocks']=[b for b in s['blocks'] if not b.get('failed')]
  s['images']=[b for b in s['blocks'] if b['type']=='image']
 stories=[s for s in stories if s['images']]
 result={'retrievedAt':datetime.now(timezone.utc).isoformat(),'source':'NASA public editorial API','rightsUrl':GUIDANCE,'editionNote':'A bounded historical NASA reading collection for an interface prototype, not a comprehensive breaking-news service.','stories':stories}
 (ROOT/'dist/corpus.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print('saved',len(stories),'stories',sum(len(s['images']) for s in stories),'image occurrences',sum(s['wordCount'] for s in stories),'words',flush=True)

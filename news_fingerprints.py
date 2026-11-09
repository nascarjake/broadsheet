"""Optional photo analysis for the saved edition; never republishes image bytes.
Requires Pillow locally. The normal app/build works from the retained index.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from io import BytesIO
import json,math,statistics,urllib.request
from news_media import public_url
from feed import tls_context
ROOT=Path(__file__).parent/'dist'
LIMIT=2_000_000

def fingerprints(data):
 from PIL import Image,ImageOps
 with Image.open(BytesIO(data)) as original:
  if original.width*original.height>30_000_000:return []
  image=ImageOps.exif_transpose(original).convert('L')
  variants=[image]
  if max(image.size)/min(image.size)>1.12:
   side=min(image.size);x=(image.width-side)//2;y=(image.height-side)//2
   variants.append(image.crop((x,y,x+side,y+side)))
  cos=[[math.cos((2*x+1)*k*math.pi/64) for x in range(32)] for k in range(8)]
  result=[]
  for variant in variants:
   pixels=list(variant.resize((32,32),Image.Resampling.LANCZOS).getdata())
   temp=[[sum(pixels[y*32+x]*cos[k][y] for y in range(32)) for x in range(32)] for k in range(8)]
   values=[sum(temp[y][x]*cos[k][x] for x in range(32)) for y in range(8) for k in range(8)]
   median=statistics.median(values[1:]);bits=[i>0 and v>median for i,v in enumerate(values)]
   if statistics.pstdev(pixels)<9:continue # blank covers and flat maps are not evidence of the same photograph
   result.append(f'{sum(int(bit)<<(63-i) for i,bit in enumerate(bits)):016x}')
  return list(dict.fromkeys(result))

def refresh():
 photos={}
 try:photos=json.loads((ROOT/'news-media-index.json').read_text()).get('photos',{})
 except (ValueError,FileNotFoundError):pass
 sources=[]
 for file in ['feed.json','corpus.json']:
  for s in json.loads((ROOT/file).read_text())['stories']:
   blocks=[*s.get('blocks',[]),*s.get('media',[])]
   image=next((m for m in blocks if m.get('type')=='image' and m.get('src')),None)
   if image:sources.append(image['src'])
 def one(src):
  if photos.get(src,{}).get('hashes'):return src,photos[src]
  try:
   if src.startswith('images/'):
    path=(ROOT/src).resolve()
    if not path.is_relative_to(ROOT.resolve()):return None
    data=path.read_bytes()
   else:
    url=public_url(src)
    if not url:return None
    req=urllib.request.Request(url,headers={'User-Agent':'Broadsheet/0.9 (photo similarity analysis)'})
    with urllib.request.urlopen(req,timeout=9,context=tls_context()) as r:
     if not public_url(r.url) or not r.headers.get('Content-Type','').startswith('image/'):return None
     data=r.read(LIMIT+1)
   if len(data)>LIMIT:return None
   hashes=fingerprints(data)
   return (src,{'hashes':hashes}) if hashes else None
  except Exception:return None
 with ThreadPoolExecutor(max_workers=8) as pool:
  for record in pool.map(one,list(dict.fromkeys(sources))):
   if record:photos[record[0]]=record[1]
 index={'version':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'method':'64-bit perceptual DCT hashes of whole image and center crop; similarity is visual evidence only, not same-event certification. No image bytes retained.','photos':photos}
 (ROOT/'news-media-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
 print('Retained photo fingerprints:',len(photos))
 return index
if __name__=='__main__':refresh()

"""Package each space without linked JS/CSS. NASA imagery remains fully embedded.
Recipe/film photos and map tiles remain provider-hosted and need a connection.
"""
from pathlib import Path
import json, base64, mimetypes, re, os
import build_spaces
root=Path(__file__).parent;dist=root/'dist'
browser_key=os.environ.get('GOOGLE_MAPS_BROWSER_KEY','')
if browser_key and not re.fullmatch(r'[A-Za-z0-9_-]{20,100}',browser_key):raise ValueError('Invalid browser key format')
public_config={}
if browser_key:public_config['googleMapsBrowserKey']=browser_key
api_base=os.environ.get('BROADSHEET_API_BASE','')
if api_base:
 if not re.fullmatch(r'https://[A-Za-z0-9.-]+\.workers\.dev/?',api_base):raise ValueError('Invalid public API origin')
 public_config['apiBase']=api_base.rstrip('/')+'/'
(dist/'config.js').write_text('/* Public configuration only. Never put server tokens here. */\nwindow.BROADSHEET_CONFIG = '+json.dumps(public_config)+';\n')
corpus=json.loads((dist/'corpus.json').read_text())
for story in corpus['stories']:
 for block in story.get('blocks',[]):
  if block.get('type')=='image' and block.get('src'):
   path=(dist/block['src']).resolve()
   if path.is_relative_to(dist.resolve()) and path.exists():
    block['src']='data:'+(mimetypes.guess_type(path.name)[0] or 'image/jpeg')+';base64,'+base64.b64encode(path.read_bytes()).decode()
news={'corpus':corpus,'feed':json.loads((dist/'feed.json').read_text()),'sources':json.loads((dist/'sources.json').read_text())}
discovery=json.loads((dist/'discovery.json').read_text())
routes={'index.html':'Broadsheet-preview.html',**{f'{key}.html':f'Broadsheet-{key}-preview.html' for key in ['news','recipes','places','movies']}}
for page,dest in routes.items():
 html=(dist/page).read_text()
 data='window.BROADSHEET_OFFLINE=true;window.'+('BROADSHEET_DATA='+json.dumps(news) if page=='news.html' else 'BROADSHEET_DISCOVERY='+json.dumps(discovery))+';'
 html=html.replace('</head>','<script>'+data.replace('</','<\\/')+'</script></head>')
 def style(m):
  path=(dist/m.group(1)).resolve()
  assert path.is_relative_to(dist.resolve())
  return '<style>'+path.read_text()+'</style>'
 html=re.sub(r'<link\b[^>]*href="([^\"]+\.css)"[^>]*>',style,html)
 def script(m):
  attrs=m.group(1);src=m.group(2);path=(dist/src).resolve()
  assert path.is_relative_to(dist.resolve())
  js=path.read_text()
  if src=='config.js':js='window.BROADSHEET_CONFIG = {};'
  if src=='vendor/leaflet.js':js='/*\n'+(dist/'vendor/LEAFLET-LICENSE').read_text()+'\n*/\n'+js
  logo=dist/'vendor/tmdb-logo.svg'
  if logo.exists():js=js.replace('vendor/tmdb-logo.svg','data:image/svg+xml;base64,'+base64.b64encode(logo.read_bytes()).decode())
  for old,new in routes.items():js=js.replace(old,new)
  return '<script'+(' type="module"' if 'type="module"' in attrs else '')+'>'+js.replace('</script','<\\/script')+'</script>'
 html=re.sub(r'<script\s+([^>]*?)src="([^\"]+)"[^>]*></script>',script,html)
 for old,new in routes.items():html=html.replace('href="'+old,'href="'+new)
 # The hub's retained NASA thumbnail is also available without a network.
 for local in re.findall(r'src="(images/[^"]+)"',html):
  path=dist/local
  if path.exists():html=html.replace('src="'+local+'"','src="data:image/jpeg;base64,'+base64.b64encode(path.read_bytes()).decode()+'"')
 assert not re.search(r'<script[^>]+src=',html),'Linked application script remains'
 (root/dest).write_text(html)
 print(dest,len(html),'characters')

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import json, os, time, threading, re
from feed import refresh
import providers
import streetview
def load_local_settings(path=None):
 path=Path(path) if path else Path(__file__).parent/'.env.local'
 if not path.is_file():return
 allowed={'TMDB_READ_TOKEN','MEALDB_KEY','GOOGLE_MAPS_BROWSER_KEY','GOOGLE_MAPS_API_KEY','NOMINATIM_URL','OVERPASS_URL'}
 for line in path.read_text().splitlines():
  key,separator,value=line.partition('=');key=key.strip();value=value.strip()
  if separator and key in allowed:
   if len(value)>1 and value[0]==value[-1] and value[0] in ['"',"'"]:value=value[1:-1]
   os.environ.setdefault(key,value)
load_local_settings()
def public_configuration():
 key=os.environ.get('GOOGLE_MAPS_BROWSER_KEY')
 result={'googleMapsBrowserKey':key} if key else {}
 api=os.environ.get('BROADSHEET_API_BASE','')
 if re.fullmatch(r'https://[A-Za-z0-9.-]+\.workers\.dev/?',api):result['apiBase']=api.rstrip('/')+'/'
 return result
ROOT=Path(__file__).parent/'dist'; lock=threading.Lock(); last=0
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def json_response(self,data,status=200):
  body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  parsed=urlsplit(self.path);q=parse_qs(parsed.query)
  try:
   if parsed.path=='/config.js' and public_configuration():
    body=('window.BROADSHEET_CONFIG = '+json.dumps(public_configuration())+';').encode();self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
   if parsed.path=='/api/capabilities':self.json_response({'refresh':True,'recipes':True,'places':True,'placesServer':True,'movies':bool(os.environ.get('TMDB_READ_TOKEN')),'nowPlaying':bool(os.environ.get('TMDB_READ_TOKEN')),'streetView':bool(os.environ.get('GOOGLE_MAPS_API_KEY'))});return
   if parsed.path=='/api/streetview':
    if self.headers.get('Sec-Fetch-Site')=='cross-site':self.send_error(403);return
    try:data,mime=streetview.fetch_image(q.get('lat',[''])[0],q.get('lon',[''])[0])
    except streetview.Unavailable:self.json_response({'error':'Street View is unavailable or not connected.'},404);return
    self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data);return
   if parsed.path=='/api/recipes':self.json_response(providers.recipes(q.get('q',[''])[0]));return
   if parsed.path=='/api/movies':self.json_response(providers.movie_catalog(q.get('q',[''])[0],q.get('region',['US'])[0],q.get('page',['1'])[0],q.get('mode',['now-playing'])[0],q.get('genre',['All'])[0]));return
  except (ValueError,TypeError) as e:self.json_response({'error':str(e)},400);return
  except Exception:self.json_response({'error':'The provider could not be reached. Your saved collection is still available.'},503);return
  super().do_GET()
 def do_POST(self):
  global last
  if self.path not in ['/api/refresh','/api/places']:self.send_error(404);return
  origin=self.headers.get('Origin')
  if self.headers.get('Sec-Fetch-Site')=='cross-site' or (origin and urlsplit(origin).netloc!=self.headers.get('Host')):self.send_error(403);return
  if self.headers.get('Content-Type')!='application/json':self.send_error(415);return
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<0 or length>4096:self.send_error(413);return
   data=json.loads(self.rfile.read(length) or b'{}')
   if not isinstance(data,dict):raise ValueError('Expected a search object.')
   if self.path=='/api/places':
    result=providers.places(str(data.get('city','')),data.get('lat'),data.get('lon'));self.json_response(result);return
   with lock:
    if time.time()-last<60:self.json_response({'error':'Please wait a minute before refreshing again.'},429);return
    last=time.time()
    try:result=refresh()
    except Exception:self.json_response({'error':'Feeds could not be reached. Your saved edition is still available.'},503);return
   self.json_response(result)
  except (ValueError,TypeError,OverflowError):self.json_response({'error':'Enter a valid city or location.'},400)
  except Exception:self.json_response({'error':'The map provider could not be reached. Your previous collection is still available. Try again shortly.'},503)
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=int(os.environ.get('PORT','8000')));p.add_argument('--host',default='127.0.0.1');p.add_argument('--strictPort',action='store_true');a=p.parse_args()
 print(f'Broadsheet: http://{a.host}:{a.port}',flush=True)
 ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()

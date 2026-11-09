from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import json, os, time, threading
from feed import refresh
import providers
import streetview
ROOT=Path(__file__).parent/'dist'; lock=threading.Lock(); last=0
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def json_response(self,data,status=200):
  body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  parsed=urlsplit(self.path);q=parse_qs(parsed.query)
  try:
   if parsed.path=='/api/capabilities':self.json_response({'refresh':True,'recipes':True,'places':True,'nowPlaying':bool(os.environ.get('TMDB_READ_TOKEN')),'streetView':bool(os.environ.get('GOOGLE_MAPS_API_KEY'))});return
   if parsed.path=='/api/streetview':
    if self.headers.get('Sec-Fetch-Site')=='cross-site':self.send_error(403);return
    try:data,mime=streetview.fetch_image(q.get('lat',[''])[0],q.get('lon',[''])[0])
    except streetview.Unavailable:self.json_response({'error':'Street View is unavailable or not connected.'},404);return
    self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data);return
   if parsed.path=='/api/recipes':self.json_response(providers.recipes(q.get('q',[''])[0]));return
   if parsed.path=='/api/movies':self.json_response(providers.now_playing(q.get('q',[''])[0],q.get('region',['US'])[0]));return
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

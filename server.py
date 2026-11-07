from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, os, time, threading
from feed import refresh
ROOT=Path(__file__).parent/'dist'; lock=threading.Lock(); last=0
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_POST(self):
  global last
  if self.path!='/api/refresh': self.send_error(404); return
  # Local prototype endpoint: fixed public feed, no arbitrary proxying.
  if self.headers.get('Sec-Fetch-Site')=='cross-site': self.send_error(403); return
  with lock:
   try:
    if time.time()-last<60: raise ValueError('Please wait a minute before refreshing again.')
    result=refresh(); last=time.time(); body=json.dumps(result).encode(); self.send_response(200)
   except Exception as e:
    body=json.dumps({'error':'Feed refresh unavailable. The saved edition is still available.'}).encode(); self.send_response(503)
  self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(body)
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(); p.add_argument('--port',type=int,default=int(os.environ.get('PORT','8000'))); p.add_argument('--host',default='127.0.0.1'); p.add_argument('--strictPort',action='store_true'); a=p.parse_args()
 print(f'Spatial Broadsheet: http://{a.host}:{a.port}',flush=True)
 ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()

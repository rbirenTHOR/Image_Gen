"""Local-only HTTP bridge for workerd environments without outbound TLS.
Never used on the hosted Site. Listens only on loopback and requires a token.
"""
import json,os,secrets,urllib.request,urllib.error,urllib.parse
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
root=Path(__file__).resolve().parent.parent
vars={}
for line in (root/'.dev.vars').read_text().splitlines():
 if '=' in line:
  key,value=line.split('=',1)
  try:vars[key]=json.loads(value)
  except:vars[key]=value
TOKEN=vars.get('DEV_PROVIDER_TOKEN') or secrets.token_urlsafe(32)
vars['DEV_PROVIDER_PROXY']='http://127.0.0.1:17889'
vars['DEV_PROVIDER_TOKEN']=TOKEN
(root/'.dev.vars').write_text('\n'.join(k+'='+json.dumps(v) for k,v in vars.items())+'\n')
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def handle_proxy(self):
  if self.headers.get('X-Bridge-Token')!=TOKEN:self.send_error(403);return
  target=self.headers.get('X-Upstream-URL','');u=urllib.parse.urlparse(target)
  if u.scheme!='https' or not (u.hostname in ['api.openai.com','queue.fal.run','fal.run','fal.media','rest.fal.ai','upload.wikimedia.org','commons.wikimedia.org','thumb.wikimedia.org'] or (u.hostname or '').endswith('.fal.media') or (u.hostname or '').endswith('.falusercontent.com')):self.send_error(403);return
  body=self.rfile.read(int(self.headers.get('Content-Length','0'))) if self.command in ['POST','PUT'] else None
  headers={k:self.headers[k] for k in ['Authorization','Content-Type','X-Fal-Object-Lifecycle','User-Agent'] if self.headers.get(k)}
  req=urllib.request.Request(target,data=body,headers=headers,method=self.command)
  try:
   with urllib.request.urlopen(req,timeout=90) as r:status=r.status;data=r.read();mime=r.headers.get('Content-Type','application/json')
  except urllib.error.HTTPError as e:status=e.code;data=e.read();mime=e.headers.get('Content-Type','application/json')
  except Exception:self.send_error(502,'Provider connection interrupted');return
  print(f'Provider transfer: {self.command} {u.hostname} {status}',flush=True)
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 do_GET=handle_proxy
 do_POST=handle_proxy
 do_PUT=handle_proxy
print('Local provider bridge ready on 127.0.0.1:17889',flush=True)
ThreadingHTTPServer(('127.0.0.1',17889),Handler).serve_forever()

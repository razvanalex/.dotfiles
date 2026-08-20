import argparse, concurrent.futures, hashlib, html, io, json, logging, os, socket, ssl, subprocess, sys, threading, time
import urllib.request, urllib.error
import urllib.parse, shutil, tempfile, uuid, mimetypes, http.client, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

log = logging.getLogger('localsend')
EMIT_LOCK = threading.Lock()

def emit(obj):
    try:
        line = json.dumps(obj, ensure_ascii=False)
        with EMIT_LOCK:
            print(line, flush=True)
    except BrokenPipeError:
        os._exit(0)
    except Exception:
        pass

HERE = Path(__file__).resolve().parent
CONF = HERE / 'localsend.conf'
CERT_DIR = HERE / 'cert'

# ---- Web Share state (for browser link downloads) ----
WEB_SHARE = {'files': [], 'text': '', 'active': False}
WEB_SHARE_LOCK = threading.Lock()

def format_bytes(b):
    if b < 1024: return f"{b} B"
    elif b < 1048576: return f"{b/1024:.1f} KB"
    elif b < 1073741824: return f"{b/1048576:.1f} MB"
    return f"{b/1073741824:.2f} GB"

def load_config():
    cfg = {'alias': 'Razvan PC', 'save_dir': '~/Downloads', 'pin': '', 'auto_accept': 'false',
           'port': 53317, 'group': '224.0.0.167'}
    try:
        for raw in CONF.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                cfg[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    cfg['port'] = int(cfg['port'])
    return cfg

CONFIG = load_config()
PORT = CONFIG['port']
GROUP = CONFIG['group']
ALIAS = CONFIG['alias']
SAVE_DIR = os.path.expanduser(CONFIG['save_dir'])
PIN = CONFIG['pin']
AUTO_ACCEPT = CONFIG['auto_accept'].lower() == 'true'
DEVICE_TYPE = 'desktop'
DEVICE_MODEL = 'Linux'
REQUIRE_PIN = False
VERIFY_CHECKSUMS = True
PROTOCOL = 'https'

def _save_dest(fileName):
    # Resolve a save path inside SAVE_DIR, refusing path traversal (a trusted
    # peer's fileName may legitimately contain subdirectories for folder shares,
    # but must not escape the save dir).
    raw = fileName or 'unnamed'
    base = Path(SAVE_DIR).resolve()
    dest = Path(SAVE_DIR) / raw
    try:
        inside = str(dest.resolve()).startswith(str(base) + os.sep)
    except OSError:
        inside = False
    if not inside:
        dest = base / Path(raw).name
    return dest

# ---- self identity (persistent self-signed cert so fingerprint is stable) ----
CERT_PEM = CERT_DIR / 'cert.pem'
KEY_PEM = CERT_DIR / 'key.pem'
CERT = None
FINGERPRINT = ''

def ensure_cert():
    global CERT, FINGERPRINT
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    if not (CERT_PEM.exists() and KEY_PEM.exists()):
        # openssl available on host; keep one-shot keygen, no passphrase
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048',
                        '-keyout', str(KEY_PEM), '-out', str(CERT_PEM), '-days', '3650',
                        '-nodes', '-subj', '/CN=localsend'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # fingerprint = sha256 of the DER cert (protocol: "SHA-256 hash of the certificate")
    der = subprocess.run(['openssl', 'x509', '-in', str(CERT_PEM), '-outform', 'DER'],
                         capture_output=True, check=True).stdout
    FINGERPRINT = hashlib.sha256(der).hexdigest()
    CERT = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    CERT.load_cert_chain(str(CERT_PEM), str(KEY_PEM))

# ---- peer registry ----
_peers = {}          # key: fingerprint(https) else ip:port ; val: dict
_peers_lock = threading.Lock()

def upsert_peer(info, ip):
    with _peers_lock:
        key = info.get('fingerprint') or ('%s:%s' % (ip, info.get('port', PORT)))
        _peers[key] = {'alias': info.get('alias'), 'ip': ip,
                       'port': int(info.get('port') or PORT),
                       'protocol': info.get('protocol', 'https'),
                       'fingerprint': info.get('fingerprint'),
                       'deviceType': info.get('deviceType'),
                       'deviceModel': info.get('deviceModel'),
                       't': time.time()}
        return list(_peers.values())

def prune_peers(ttl=300):
    now = time.time()
    with _peers_lock:
        for k in [k for k, v in _peers.items() if now - v['t'] > ttl]:
            del _peers[k]

def advertise_body(announce=True):
    return {'alias': ALIAS, 'version': '2.0', 'deviceModel': DEVICE_MODEL,
            'deviceType': DEVICE_TYPE, 'fingerprint': FINGERPRINT, 'port': PORT,
            'protocol': PROTOCOL, 'announce': announce}

# ---- multicast & broadcast UDP: listen for announces + periodic self-announce ----
def unicast_register(ip, port, info, protocol='https'):
    # HTTP/HTTPS register reply to a peer that announced to us
    scheme = protocol or 'https'
    url = f"{scheme}://{ip}:{port}/api/localsend/v2/register"
    data = json.dumps(info).encode()
    req = urllib.request.Request(url, data=data, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        if CERT_PEM.exists() and KEY_PEM.exists():
            ctx.load_cert_chain(str(CERT_PEM), str(KEY_PEM))
        with urllib.request.urlopen(req, context=ctx if scheme == 'https' else None, timeout=3) as r:
            return r.status
    except Exception as e:
        log.debug('unicast_register to %s failed: %r', ip, e)
        return None

def udp_listener(sock):
    while True:
        try:
            data, addr = sock.recvfrom(4096)
        except OSError:
            break
        try:
            info = json.loads(data.decode('utf-8'))
        except Exception:
            continue
        if info.get('fingerprint') == FINGERPRINT:
            continue  # self
        peers = upsert_peer(info, addr[0])
        # tell the announcing origin about us (two-way discovery)
        if info.get('announce') is True:
            proto = info.get('protocol', 'https')
            threading.Thread(target=unicast_register,
                             args=(addr[0], int(info.get('port') or PORT), advertise_body(False), proto),
                             daemon=True).start()
        emit({'type': 'peers', 'peers': peers})

def udp_announcer(sock, ttl=5):
    mreq = socket.inet_aton(GROUP) + socket.inet_aton('0.0.0.0')
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    except OSError as e:
        log.warning('add membership failed: %r', e)
    payload = json.dumps(advertise_body(True)).encode()
    while True:
        # 1) Multicast to group (standard LocalSend)
        try:
            sock.sendto(payload, (GROUP, PORT))
        except OSError:
            pass
        # 2) Subnet broadcast (critical for iOS/routers that drop multicast)
        try:
            sock.sendto(payload, ('<broadcast>', PORT))
        except OSError:
            pass
        time.sleep(ttl)

# ---- HTTPS server (receive + register) ----
class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _send(self, code, obj=None):
        body = b''
        if obj is not None:
            body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        clean_path = self.path.split('?')[0]
        if clean_path.startswith('/api/localsend/v2/info'):
            self._send(200, advertise_body(False))
        elif clean_path in ('/web', '/web/', '/', ''):
            self._serve_web_index()
        elif clean_path.startswith('/web/file/'):
            fid = clean_path[len('/web/file/'):]
            self._serve_web_file(urllib.parse.unquote(fid))
        elif clean_path == '/web/zip':
            self._serve_web_zip()
        else:
            self._send(404, {'error': 'not found'})

    def _serve_web_index(self):
        with WEB_SHARE_LOCK:
            files = list(WEB_SHARE.get('files') or [])
            text = WEB_SHARE.get('text') or ''
        
        items_html = ""
        for f in files:
            name_esc = html.escape(f['name'])
            sz_str = format_bytes(f.get('size', 0))
            dl_url = f"/web/file/{urllib.parse.quote(f['id'])}"
            items_html += f"""
            <div class="item">
              <div>
                <div class="item-name">{name_esc}</div>
                <div class="item-meta">{sz_str}</div>
              </div>
              <a href="{dl_url}" download="{name_esc}" class="btn">Download</a>
            </div>
            """
        
        text_html = ""
        if text:
            text_esc = html.escape(text)
            text_html = f"""
            <div class="section-title">Shared Text</div>
            <div class="text-box" id="shareText">{text_esc}</div>
            <button class="btn" onclick="copyText()">Copy Text</button>
            <div style="height: 16px;"></div>
            """

        zip_html = ""
        if len(files) > 1:
            zip_html = f'<a href="/web/zip" class="btn btn-all">Download All as ZIP ({len(files)} files)</a>'

        empty_html = '<div class="empty">No active files shared right now.<br>Open LocalSend on your desktop to share files.</div>' if (not files and not text) else ''

        body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LocalSend Web Share</title>
<style>
  :root {{ --bg: #0f1117; --surface: #1a1d27; --primary: #3b82f6; --primary-hover: #2563eb; --text: #f3f4f6; --sub: #9ca3af; --border: #2d3345; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 90vh; }}
  .card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 520px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); box-sizing: border-box; }}
  h1 {{ font-size: 20px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; color: var(--text); }}
  .sender {{ color: var(--sub); font-size: 13px; margin-bottom: 20px; }}
  .section-title {{ font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--sub); margin: 12px 0 8px; }}
  .item {{ display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-bottom: 8px; border: 1px solid var(--border); gap: 12px; }}
  .item-name {{ font-weight: 500; font-size: 14px; word-break: break-all; }}
  .item-meta {{ font-size: 12px; color: var(--sub); margin-top: 2px; }}
  .btn {{ display: inline-flex; align-items: center; justify-content: center; background: var(--primary); color: white; border: none; padding: 8px 18px; border-radius: 999px; text-decoration: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; }}
  .btn:hover {{ background: var(--primary-hover); }}
  .btn-all {{ width: 100%; padding: 12px; font-size: 14px; margin-top: 14px; box-sizing: border-box; }}
  .text-box {{ background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 10px; padding: 14px; font-size: 14px; white-space: pre-wrap; margin-bottom: 12px; word-break: break-word; line-height: 1.5; }}
  .empty {{ text-align: center; color: var(--sub); padding: 30px 0; font-size: 14px; line-height: 1.6; }}
</style>
</head>
<body>
<div class="card">
  <h1>LocalSend Web Share</h1>
  <div class="sender">Shared by <b>{html.escape(ALIAS)}</b></div>
  {text_html}
  {f'<div class="section-title">Files ({len(files)})</div>' if files else ''}
  {items_html}
  {zip_html}
  {empty_html}
</div>
<script>
function copyText() {{
  const t = document.getElementById('shareText').innerText;
  navigator.clipboard.writeText(t).then(() => alert('Copied to clipboard!'));
}}
</script>
</body>
</html>
""".encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_web_file(self, fid):
        with WEB_SHARE_LOCK:
            files = list(WEB_SHARE.get('files') or [])
        target = next((f for f in files if f['id'] == fid or f['name'] == fid), None)
        if not target or not Path(target['path']).is_file():
            self._send(404, {'error': 'file not found'}); return
        p = Path(target['path'])
        ctype = mimetypes.guess_type(str(p))[0] or 'application/octet-stream'
        size = p.stat().st_size
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Disposition', f'attachment; filename="{p.name}"')
        self.send_header('Content-Length', str(size))
        self.end_headers()
        with open(p, 'rb') as f:
            shutil.copyfileobj(f, self.wfile)

    def _serve_web_zip(self):
        with WEB_SHARE_LOCK:
            files = list(WEB_SHARE.get('files') or [])
        if not files:
            self._send(404, {'error': 'no files'}); return
        bio = io.BytesIO()
        with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                p = Path(f['path'])
                if p.is_file():
                    zf.write(p, arcname=f['name'])
        data = bio.getvalue()
        self.send_response(200)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', 'attachment; filename="localsend_shared.zip"')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = self.path.split('?')[0]
        # /upload streams the raw file bytes directly (files can be large) —
        # do NOT pre-read into memory like the JSON routes below.
        if path == '/api/localsend/v2/upload':
            self._stream_upload()
            return
        try:
            ln = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(ln) if ln else b''
        except Exception:
            raw = b''
        if path == '/api/localsend/v2/register':
            try:
                info = json.loads(raw.decode('utf-8'))
            except Exception:
                info = {}
            peers = upsert_peer(info, self.client_address[0])
            emit({'type': 'peers', 'peers': peers})
            self._send(200, advertise_body(False))
        elif path == '/api/localsend/v2/prepare-upload':
            try:
                body = json.loads(raw.decode('utf-8'))
            except Exception:
                self._send(400, {'error': 'invalid body'}); return
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if (REQUIRE_PIN or (PIN and len(PIN))) and (qs.get('pin') or [''])[0] != PIN:
                self._send(401, {'error': 'PIN required'}); return
            files = body.get('files') or {}
            if not files:
                self._send(204, None); return
            log.info('PREPARE nfiles=%d', len(files))
            sid = new_sid()
            infos = {fid: {'fileName': fi.get('fileName'), 'size': int(fi.get('size') or 0),
                           'fileType': fi.get('fileType'), 'sha256': fi.get('sha256'),
                           'preview': fi.get('preview'),
                           'sourceText': ((fi.get('metadata') or {}).get('sourceText')) or fi.get('preview')}
                     for fid, fi in files.items()}
            s = {'sid': sid, 'files': infos, 'tokens': {}, 'sender_ip': self.client_address[0],
                 'decision': None, 'decision_event': threading.Event(), 'accepted': False,
                 'written': {fid: 0 for fid in infos}, 'cancelled': False,
                 'created': time.time(), 'finished': None}
            with SESSIONS_LOCK:
                SESSIONS[sid] = s
            emit({'type': 'inbound', 'session': sid,
                  'sender': (body.get('info') or {}).get('alias'),
                  'files': [{'id': fid, 'fileName': fi['fileName'], 'size': fi['size'],
                             'fileType': fi.get('fileType'),
                             'preview': fi.get('sourceText') or fi.get('preview'),
                             'isText': fi.get('fileType') == 'text' or fi.get('sourceText') is not None}
                            for fid, fi in infos.items()]})
            if AUTO_ACCEPT:
                accept_session(sid)
            s['decision_event'].wait(timeout=300)
            if s.get('decision') == 'accept':
                s['accepted'] = True
                for fid in infos:
                    s['tokens'][fid] = uuid.uuid4().hex
                emit({'type': 'accepted', 'session': sid})
                self._send(200, {'sessionId': sid, 'files': s['tokens']})
            else:
                with SESSIONS_LOCK:
                    SESSIONS.pop(sid, None)
                self._send(403, {'error': 'rejected'})
        elif path == '/api/localsend/v2/cancel':
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            sid = (qs.get('sessionId') or [''])[0]
            if sid:
                cancel_session(sid)
            self._send(200, {})
        else:
            self._send(404, {'error': 'not found'})

    def _stream_upload(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        sid = (qs.get('sessionId') or [''])[0]
        fid = (qs.get('fileId') or [''])[0]
        tok = (qs.get('token') or [''])[0]
        with SESSIONS_LOCK:
            s = SESSIONS.get(sid)
            if not s or s.get('cancelled'):
                self._send(400, {'error': 'bad session'}); return
            if s.get('sender_ip') != self.client_address[0]:
                self._send(403, {'error': 'ip mismatch'}); return
            if s.get('tokens', {}).get(fid) != tok:
                self._send(403, {'error': 'bad token'}); return
            fi = s['files'].get(fid)
            if not fi:
                self._send(400, {'error': 'bad file'}); return
        tmp = Path(tempfile.gettempdir()) / ('lsin_%s_%s' % (sid, fid))
        size = 0
        hasher = hashlib.sha256() if fi.get('sha256') else None
        cl = self.headers.get('Content-Length')
        te = self.headers.get('Transfer-Encoding', '')
        chunked = 'chunked' in te.lower()
        log.info('UPLOAD clen=%r te=%r filesize=%s hasha=%s', cl, te, fi.get('size'), bool(fi.get('sha256')))
        last_emit = [0.0]
        def report(n):
            nonlocal size
            size += n
            with SESSIONS_LOCK:
                s['written'][fid] = size
            now = time.time()
            if now - last_emit[0] >= 0.1:   # throttle: ~10 events/sec
                last_emit[0] = now
                emit({'type': 'progress', 'session': sid, 'fileId': fid,
                      'written': size, 'total': fi['size']})
        def feed(b):
            fh.write(b)
            if hasher:
                hasher.update(b)
            report(len(b))
        with open(tmp, 'wb') as fh:
            if chunked:
                # HTTP/1.1 chunked body (iOS/Flutter stream real files this way)
                while True:
                    line = self.rfile.readline()
                    try:
                        csize = int(line.split(b';')[0].strip(), 16)
                    except ValueError:
                        log.info('CHUNK parse-fail size=%d', size)
                        break
                    if csize == 0:
                        self.rfile.readline()   # trailers terminator
                        log.info('CHUNK end size=%d', size)
                        break
                    left = csize
                    while left > 0:
                        c = self.rfile.read(min(65536, left))
                        if not c:
                            log.info('CHUNK read-eof left=%d size=%d', left, size)
                            break
                        feed(c)
                        left -= len(c)
                    self.rfile.readline()       # CRLF after chunk data
            elif cl is not None and cl.isdigit() and int(cl) > 0:
                remaining = int(cl)
                while remaining > 0:
                    c = self.rfile.read(min(65536, remaining))
                    if not c:
                        break
                    feed(c)
                    remaining -= len(c)
            # else: empty body (text payloads carried in preview/sourceText)
        
        is_text = fi.get('fileType') == 'text' or fi.get('sourceText') is not None
        text_content = fi.get('sourceText')
        if not text_content and is_text and tmp.exists():
            try:
                text_content = tmp.read_text(encoding='utf-8', errors='replace')
            except Exception:
                pass

        if fi.get('sourceText') is not None:
            # LocalSend text share: the content lives in metadata.sourceText; the
            # upload body is empty (Content-Length 0). Save the text and skip the
            # body-hash check, which would otherwise mismatch on the empty body.
            dest = _save_dest(fi['fileName'])
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                dest = dest.parent / ('%s-%s%s' % (dest.stem, sid[:6], dest.suffix))
            dest.write_text(fi['sourceText'], encoding='utf-8')
            with SESSIONS_LOCK:
                s['written'][fid] = len(fi['sourceText'])
            _mark_finished(sid)
            emit({'type': 'done', 'session': sid, 'fileId': fid, 'path': str(dest),
                  'fileName': fi['fileName'], 'size': len(fi['sourceText']),
                  'text': fi['sourceText'], 'isText': True})
            tmp.unlink(missing_ok=True)
            self._send(200, {})
            return
        if VERIFY_CHECKSUMS and fi.get('sha256') and hasher and hasher.hexdigest() != fi['sha256']:
            log.info('HASHMISMATCH size=%d expect=%s got=%s', size, fi['sha256'],
                     hasher.hexdigest())
            tmp.unlink(missing_ok=True)
            self._send(422, {'error': 'checksum mismatch'}); return
        dest = _save_dest(fi['fileName'])
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest = dest.parent / ('%s-%s%s' % (dest.stem, sid[:6], dest.suffix))
        shutil.move(str(tmp), str(dest))
        with SESSIONS_LOCK:
            s['written'][fid] = size
        _mark_finished(sid)
        emit({'type': 'done', 'session': sid, 'fileId': fid, 'path': str(dest),
              'fileName': fi['fileName'], 'size': size,
              'text': text_content, 'isText': is_text})
        self._send(200, {})

    def log_message(self, *a):
        pass

def main():
    global ALIAS, SAVE_DIR, PIN, AUTO_ACCEPT, PORT, DEVICE_TYPE, DEVICE_MODEL, REQUIRE_PIN, VERIFY_CHECKSUMS, GROUP
    ap = argparse.ArgumentParser(description='LocalSend v2 agent sidecar')
    ap.add_argument('--send', nargs='+', metavar='ARG',
                    help='one-shot send: HOST FILE [FILE...] (no daemon)')
    ap.add_argument('--target', action='append', default=[],
                    help='target peer spec: HOST[:PIN] (repeatable for multi-target)')
    ap.add_argument('--text', default=None, help='text payload for --send')
    ap.add_argument('--pin', default=None, help='optional PIN code')
    ap.add_argument('--alias', default=None, help='device alias')
    ap.add_argument('--device-type', default=None, help='device type (desktop, laptop, mobile, headless)')
    ap.add_argument('--device-model', default=None, help='device model (e.g. Linux, macOS)')
    ap.add_argument('--require-pin', action='store_true', help='require PIN for incoming transfers')
    ap.add_argument('--no-verify-checksums', action='store_true', help='disable checksum verification')
    ap.add_argument('--group', default=None, help='multicast group IP')
    ap.add_argument('--save-dir', default=None, help='directory to save received files')
    ap.add_argument('--auto-accept', action='store_true', help='automatically accept incoming transfers')
    ap.add_argument('--port', type=int, default=None, help='TCP/UDP port')
    ap.add_argument('files', nargs='*', default=[], help='files when using --target')
    args = ap.parse_args()
    if args.alias:
        ALIAS = args.alias
    if args.device_type:
        DEVICE_TYPE = args.device_type
    if args.device_model:
        DEVICE_MODEL = args.device_model
    if args.require_pin:
        REQUIRE_PIN = True
    if args.no_verify_checksums:
        VERIFY_CHECKSUMS = False
    if args.group:
        GROUP = args.group
    if args.save_dir:
        SAVE_DIR = os.path.expanduser(args.save_dir)
    if args.pin is not None and len(args.pin):
        PIN = args.pin
    if args.auto_accept:
        AUTO_ACCEPT = True
    if args.port:
        PORT = args.port
    if args.target:
        logging.basicConfig(level=logging.INFO)
        ensure_cert()
        targets = []
        for raw in args.target:
            parts = raw.split(':')
            host = parts[0]
            pin = parts[1] if len(parts) > 1 and parts[1] else (args.pin or None)
            targets.append({'ip': host, 'port': PORT, 'protocol': PROTOCOL, 'pin': pin})
        threads = [threading.Thread(target=send_to, args=(t, args.files, args.text, t.get('pin')))
                   for t in targets]
        for th in threads: th.start()
        for th in threads: th.join()
        return
    if args.send:
        logging.basicConfig(level=logging.INFO)
        host = args.send[0]
        peer = {'ip': host, 'port': PORT, 'protocol': PROTOCOL}
        # ensure_cert so the sending fingerprint is coherent; ad-hoc sends do not
        # pin (no fingerprint known) — the control /send path pins via discovery
        ensure_cert()
        send_to(peer, args.send[1:] or [], args.text, pin=args.pin)
        return
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    ensure_cert()
    log.info('daemon up alias=%s port=%d fp=%s', ALIAS, PORT, FINGERPRINT[:16])
    emit({'type': 'self', 'alias': ALIAS, 'fingerprint': FINGERPRINT, 'port': PORT})
    # UDP discovery
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    udp.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    except (AttributeError, OSError):
        pass
    udp.bind(('', PORT))
    threading.Thread(target=udp_listener, args=(udp,), daemon=True).start()
    threading.Thread(target=udp_announcer, args=(udp,), daemon=True).start()
    # loopback control IPC for the QML shell (accept/decline/cancel/stop)
    threading.Thread(target=control_server, daemon=True).start()
    # housekeeping (peer expiry, session cleanup)
    threading.Thread(target=maintenance, daemon=True).start()
    # HTTPS server (per-connection TLS via LocalServer.get_request)
    httpd = LocalServer(('0.0.0.0', PORT), Handler)
    httpd.serve_forever()

# ---- receive sessions + QML control (loopback HTTP) ----
CONTROL_PORT = PORT + 1
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()

def new_sid():
    return uuid.uuid4().hex

def _decide(sid, decision):
    with SESSIONS_LOCK:
        s = SESSIONS.get(sid)
        if not s:
            return False
        s['decision'] = decision
        if decision in ('decline', 'cancel'):
            s['finished'] = time.time()
        s['decision_event'].set()
        return True

def accept_session(sid):
    return _decide(sid, 'accept')

def decline_session(sid):
    ok = _decide(sid, 'decline')
    emit({'type': 'declined', 'session': sid})
    return ok

def cancel_session(sid):
    with SESSIONS_LOCK:
        s = SESSIONS.get(sid)
        if not s:
            return False
        s['decision'] = 'cancel'
        s['cancelled'] = True
        s['finished'] = time.time()
        s['decision_event'].set()
    emit({'type': 'declined', 'session': sid})
    return True

def _mark_finished(sid):
    with SESSIONS_LOCK:
        s = SESSIONS.get(sid)
        if s:
            s['finished'] = time.time()

def session_cleanup(pending_ttl=300, finished_ttl=60):
    now = time.time()
    with SESSIONS_LOCK:
        for k, s in list(SESSIONS.items()):
            created = s.get('created') or now
            finished = s.get('finished')
            if finished is not None and now - finished > finished_ttl:
                del SESSIONS[k]
            elif finished is None and now - created > pending_ttl:
                del SESSIONS[k]

def maintenance():
    # housekeeping: drop stale peers and finished/abandoned sessions
    while True:
        time.sleep(10)
        prune_peers(ttl=30)
        session_cleanup()

class ControlHandler(BaseHTTPRequestHandler):
    # loopback-only IPC: /accept?session=ID /decline /cancel /stop
    def _no(self, code):
        self.send_response(code)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        self.do_POST()

    def do_POST(self):
        try:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        except Exception:
            q = {}
        sid = (q.get('session') or q.get('sessionId') or [''])[0]
        p = self.path.split('?')[0]
        if p == '/accept' and sid:
            accept_session(sid); self._no(200)
        elif p == '/decline' and sid:
            decline_session(sid); self._no(200)
        elif p == '/cancel' and sid:
            cancel_session(sid); self._no(200)
        elif p == '/stop':
            os._exit(0)
        elif p == '/send':
            try:
                ln = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(ln).decode('utf-8'))
            except Exception:
                self._no(400); return
            peer = {'ip': body.get('ip'), 'port': body.get('port') or PORT,
                    'protocol': body.get('protocol') or 'https',
                    'fingerprint': body.get('fingerprint'),
                    'alias': body.get('alias')}
            threading.Thread(target=send_to, kwargs={
                'peer': peer, 'paths': body.get('files') or [], 'text': body.get('text')},
                daemon=True).start()
            self._no(202)
        elif p == '/webshare':
            try:
                ln = int(self.headers.get('Content-Length') or 0)
                body = json.loads(self.rfile.read(ln).decode('utf-8')) if ln else {}
            except Exception:
                self._no(400); return
            with WEB_SHARE_LOCK:
                if body.get('action') == 'clear':
                    WEB_SHARE['active'] = False
                    WEB_SHARE['files'] = []
                    WEB_SHARE['text'] = ''
                else:
                    paths = body.get('files') or []
                    files = []
                    for idx, pt in enumerate(paths):
                        pobj = Path(pt)
                        if pobj.is_file():
                            files.append({'id': str(idx), 'name': pobj.name, 'path': str(pobj), 'size': pobj.stat().st_size})
                    WEB_SHARE['files'] = files
                    WEB_SHARE['text'] = body.get('text') or ''
                    WEB_SHARE['active'] = True
            emit({'type': 'webshare', 'active': WEB_SHARE['active'],
                  'files': [f['name'] for f in WEB_SHARE['files']],
                  'text': WEB_SHARE['text']})
            self._no(200)
        else:
            self._no(404)

    def log_message(self, *a):
        pass

def control_server():
    ThreadingHTTPServer(('127.0.0.1', CONTROL_PORT), ControlHandler).serve_forever()

class LocalServer(ThreadingHTTPServer):
    # TLS the canonical way: wrap each ACCEPTED connection (not the listening
    # socket, whose wrapped-accept reads break on the 2nd+ connection).
    def get_request(self):
        sock, addr = self.socket.accept()
        return CERT.wrap_socket(sock, server_side=True), addr

# ---- send client (outbound) ----
def _peer_base(peer):
    scheme = 'https' if peer.get('protocol', 'https') == 'https' else 'http'
    return '%s://%s:%s' % (scheme, peer['ip'], peer.get('port') or PORT)

def _new_send_ctx(peer):
    if peer.get('protocol', 'https') != 'https':
        return None
    ctx = ssl._create_unverified_context()
    if peer.get('fingerprint'):
        # pin: verify the peer's self-signed cert matches the announced fingerprint
        probe = socket.create_connection((peer['ip'], peer.get('port') or PORT), timeout=12)
        probe = ctx.wrap_socket(probe, server_hostname=peer['ip'])
        der = probe.getpeercert(binary_form=True) or b''
        probe.close()
        # LocalSend announces the fingerprint in the case its client emits
        # (often UPPERCASE); hexdigest() is lowercase — compare case-insensitively
        if hashlib.sha256(der).hexdigest().lower() != str(peer['fingerprint']).lower():
            raise RuntimeError('peer fingerprint mismatch (possible MITM)')
    # LocalSend uses mutual TLS: present our own self-signed cert as the client
    # certificate (the receiver requires it, else TLSV13_ALERT_CERTIFICATE_REQUIRED)
    if CERT_PEM.exists() and KEY_PEM.exists():
        ctx.load_cert_chain(str(CERT_PEM), str(KEY_PEM))
    return ctx

def _hash_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()

def _send_one_stream(peer, ctx, session, fid, token, source_file, total, on_progress=None):
    # streaming upload body via http.client (no whole-file-in-memory), with
    # throttled progress events. source_file may be None for a 0-length body.
    https = peer.get('protocol', 'https') == 'https'
    cls = http.client.HTTPSConnection if https else http.client.HTTPConnection
    conn = cls(peer['ip'], peer.get('port') or PORT, timeout=120, context=ctx)
    path = ('/api/localsend/v2/upload?sessionId=%s&fileId=%s&token=%s' % (session, fid, token))
    conn.putrequest('POST', path)
    conn.putheader('Content-Length', str(total))
    conn.putheader('Content-Type', 'application/octet-stream')
    conn.endheaders()
    sent = 0
    last = [0.0]
    if source_file is not None:
        while True:
            chunk = source_file.read(1 << 20)
            if not chunk:
                break
            conn.send(chunk)
            sent += len(chunk)
            now = time.time()
            if now - last[0] >= 0.15:   # throttle: ~7 events/sec
                last[0] = now
                if on_progress:
                    on_progress(fid, sent, total)
        if on_progress:
            on_progress(fid, sent, total)
    resp = conn.getresponse()
    status = resp.status
    resp.read()
    conn.close()
    return status, sent

def _build_send_items(paths):
    items = []
    def add(path, rel=None):
        if os.path.isdir(path):
            # folder share: walk it, keeping the relative structure so the
            # receiver can recreate subdirectories
            for root, _dirs, files in os.walk(path):
                for fn in files:
                    full = os.path.join(root, fn)
                    add(full, os.path.relpath(full, path))
            return
        name = rel if rel is not None else os.path.basename(path)
        fi = {'id': uuid.uuid4().hex, 'fileName': name,
              'size': os.path.getsize(path),
              'fileType': mimetypes.guess_type(path)[0] or 'application/octet-stream',
              'sha256': _hash_file(path)}
        items.append((fi['id'], fi, open(path, 'rb')))
    for p in paths:
        add(p)
    return items

def send_to(peer, paths=(), text=None, pin=None):
    items = _build_send_items(paths)
    if text is not None:
        tb = text.encode('utf-8')
        tid = uuid.uuid4().hex
        fi = {'id': tid, 'fileName': 'Shared text.txt', 'size': len(tb),
              'fileType': 'text/plain',
              'sha256': hashlib.sha256(tb).hexdigest(),
              'preview': text, 'metadata': {'sourceText': text}}
        items.append((tid, fi, None))
    emit({'type': 'sending', 'peer': peer.get('alias') or peer['ip'],
          'files': [fi['fileName'] for _, fi, _ in items]})
    try:
        ctx = _new_send_ctx(peer)
        base = _peer_base(peer)
        target_pin = pin if pin is not None else (PIN or None)
        endpoint = '/api/localsend/v2/prepare-upload'
        if target_pin:
            endpoint += '?pin=' + urllib.parse.quote(str(target_pin))
        payload = {'info': advertise_body(False),
                   'files': {fid: fi for fid, fi, _ in items}}
        req = urllib.request.Request(base + endpoint,
                                     data=json.dumps(payload).encode(), method='POST',
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, context=ctx, timeout=120) as r:
            raw = r.read().decode('utf-8').strip()
            resp = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        for _, _, src in items:
            if src is not None:
                src.close()
        msg = f"HTTP Error {e.code}: {e.reason}"
        if e.code == 401:
            msg = "PIN required or invalid (HTTP 401)"
        elif e.code == 409:
            msg = "Target device is busy with an unfinished transfer (HTTP 409)"
        emit({'type': 'senderror', 'error': msg, 'peer': peer.get('alias') or peer['ip'], 'ip': peer['ip']})
        return
    except Exception as e:
        for _, _, src in items:
            if src is not None:
                src.close()
        emit({'type': 'senderror', 'error': str(e), 'peer': peer.get('alias') or peer['ip'], 'ip': peer['ip']})
        return
    session = resp.get('sessionId')
    tokens = resp.get('files') or {}
    peer_name = peer.get('alias') or peer['ip']

    file_written = {}
    progress_lock = threading.Lock()
    total_batch_bytes = max(1, sum(fi['size'] for _, fi, _ in items))

    def on_chunk(fid, sent, total):
        with progress_lock:
            file_written[fid] = sent
            curr_written = sum(file_written.values())
        emit({'type': 'sendprogress', 'fileId': fid,
              'written': curr_written, 'total': total_batch_bytes,
              'peer': peer_name})

    def _upload_one(idx_item):
        idx, (fid, fi, src) = idx_item
        token = tokens.get(fid)
        ok = False
        emit({'type': 'sendfile', 'fileId': fid, 'fileName': fi['fileName'],
              'total': fi['size'], 'idx': idx, 'peer': peer_name})
        try:
            if src is not None and token is not None:
                status, _ = _send_one_stream(peer, ctx, session, fid, token, src, fi['size'], on_progress=on_chunk)
                ok = (status == 200)
            elif src is None:
                # Text item: content is delivered inline in prepare-upload; no separate stream upload
                with progress_lock:
                    file_written[fid] = fi['size']
                ok = True
            else:
                ok = False
        except Exception as e:
            emit({'type': 'senderror', 'fileId': fid, 'error': str(e), 'peer': peer_name})
        finally:
            if src is not None:
                try:
                    src.close()
                except Exception:
                    pass
        with progress_lock:
            file_written[fid] = fi['size'] if ok else file_written.get(fid, 0)
            curr_written = sum(file_written.values())
        emit({'type': 'sendprogress', 'fileId': fid, 'fileName': fi['fileName'],
              'idx': idx, 'ok': ok, 'session': session, 'written': curr_written,
              'total': total_batch_bytes, 'peer': peer_name})
        return ok

    max_workers = min(3, max(1, len(items)))
    if max_workers > 1:
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
            list(pool.map(_upload_one, enumerate(items)))
    else:
        for it in enumerate(items):
            _upload_one(it)

    emit({'type': 'senddone', 'session': session, 'peer': peer_name})

if __name__ == '__main__':
    main()

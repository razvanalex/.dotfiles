#!/usr/bin/env python3
# LocalSend v2.2 agent for the quickshell shell (sidecar pattern).
# Emits JSON events on stdout consumed by QML Process + SplitParser.
# Task 1: discovery (UDP announce + /register) + self fingerprint/cert + /info.
# Receive (prepare-upload/upload/cancel) and send are added in later tasks.
import argparse, hashlib, json, logging, os, socket, ssl, subprocess, sys, threading, time
import urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

log = logging.getLogger('localsend')

def emit(obj):
    try:
        print(json.dumps(obj, ensure_ascii=False), flush=True)
    except BrokenPipeError:
        os._exit(0)
    except Exception:
        pass

HERE = Path(__file__).resolve().parent
CONF = HERE / 'localsend.conf'
CERT_DIR = HERE / 'cert'

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
PROTOCOL = 'https'

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
                       'deviceType': info.get('deviceType'), 't': time.time()}
        return list(_peers.values())

def prune_peers(ttl=300):
    now = time.time()
    with _peers_lock:
        for k in [k for k, v in _peers.items() if now - v['t'] > ttl]:
            del _peers[k]

def advertise_body(announce=True):
    return {'alias': ALIAS, 'version': '2.0', 'deviceModel': 'Linux',
            'deviceType': DEVICE_TYPE, 'fingerprint': FINGERPRINT, 'port': PORT,
            'protocol': PROTOCOL, 'announce': announce}

# ---- multicast UDP: listen for announces + periodic self-announce ----
def unicast_register(ip, port, info):
    # HTTP register reply to a peer that announced to us
    url = 'http://%s:%s/api/localsend/v2/register' % (ip, port)
    data = json.dumps(info).encode()
    req = urllib.request.Request(url, data=data, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=2) as r:
            return r.status
    except Exception:
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
            unicast_register(addr[0], int(info.get('port') or PORT), advertise_body(False))
        emit({'type': 'peers', 'peers': peers})

def udp_announcer(sock, ttl=10):
    mreq = socket.inet_aton(GROUP) + socket.inet_aton('0.0.0.0')
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    except OSError as e:
        log.warning('add membership failed: %r', e)
    payload = json.dumps(advertise_body(True)).encode()
    while True:
        try:
            sock.sendto(payload, (GROUP, PORT))
        except OSError:
            pass
        time.sleep(ttl)

# ---- HTTPS server (receive + register) ----
class Handler(BaseHTTPRequestHandler):
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
        if self.path.startswith('/api/localsend/v2/info'):
            self._send(200, advertise_body(False))
        else:
            self._send(404, {'error': 'not found'})

    def do_POST(self):
        path = self.path.split('?')[0]
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
            self._send(501, {'error': 'receive not implemented yet'})
        elif path == '/api/localsend/v2/upload':
            self._send(501, {'error': 'receive not implemented yet'})
        elif path == '/api/localsend/v2/cancel':
            self._send(200, {})
        else:
            self._send(404, {'error': 'not found'})

    def log_message(self, *a):
        pass

def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    ensure_cert()
    emit({'type': 'self', 'alias': ALIAS, 'fingerprint': FINGERPRINT, 'port': PORT})
    # UDP discovery
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    except (AttributeError, OSError):
        pass
    udp.bind(('', PORT))
    threading.Thread(target=udp_listener, args=(udp,), daemon=True).start()
    threading.Thread(target=udp_announcer, args=(udp,), daemon=True).start()
    # HTTPS server: bind once, then wrap the bound socket with TLS in place
    httpd = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    httpd.socket = CERT.wrap_socket(httpd.socket, server_side=True)
    httpd.serve_forever()

if __name__ == '__main__':
    main()

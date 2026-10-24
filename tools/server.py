"""Local dev server: serves the project folder with CORS (for the Project 0 dev kit)
and accepts POST /save/<path> so the in-browser builder can write GLBs into build/
(and tools/covers.html, tools/trailer.html their pictures into docs/crazygames/media/).

A page given after the port is served at / instead of index.html, with the query kept: a Discord
activity always opens at /, so `python tools/server.py 5550 tools/discordspike.html` behind a tunnel
opens the spike page there. A folder given there is served as the root instead of the project's:
`python tools/server.py 5550 dist/discord` serves the Discord build."""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE_DIRS = ('build/', 'tmp/', 'docs/crazygames/media/')
HOME = None  # the page served at /, when one is given
SERVE = ROOT  # the folder served


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SERVE, **k)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if HOME and self.path.split('?')[0] == '/':
            self.path = '/' + HOME + self.path[1:]
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if not self.path.startswith('/save/'):
            self.send_error(404)
            return
        rel = self.path[len('/save/'):].split('?')[0]
        if '..' in rel or not rel.startswith(SAVE_DIRS):
            self.send_error(403)
            return
        n = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(n)
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, fmt, *args):
        sys.stderr.write('%s\n' % (fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    arg = sys.argv[2].strip('/') if len(sys.argv) > 2 else None
    if arg and os.path.isdir(os.path.join(ROOT, arg)):
        SERVE = os.path.join(ROOT, arg)
    else:
        HOME = arg
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()

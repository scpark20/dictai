from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class RedirectHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        host = self.headers.get("Host", "192.168.0.68").split(":", 1)[0]
        self.send_response(308)
        self.send_header("Location", f"https://{host}:8771{self.path}")
        self.end_headers()

    def log_message(self, format, *args):
        return


ThreadingHTTPServer(("0.0.0.0", 8770), RedirectHandler).serve_forever()

"""Tiny demo service with a reproducible configuration incident."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            # The mismatch is intentional: this service expects the legacy key.
            if "PAYMENT_TIMEOUT" not in os.environ:
                self.send_response(500)
                body = {"status": "error", "error": "missing PAYMENT_TIMEOUT"}
            else:
                self.send_response(200)
                body = {"status": "ok"}
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    print("Demo service: http://127.0.0.1:8080/health (expected to return 500 initially)")
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()

"""Loopback-only demo service with an intentional configuration incident."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json

BROKEN_CONFIG = {"PAYMENT_TIMEOUT_MS": "5000"}
config = BROKEN_CONFIG.copy()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            if "PAYMENT_TIMEOUT" not in config:
                self.send_json(500, {"status": "error", "error": "missing PAYMENT_TIMEOUT"})
            else:
                self.send_json(200, {"status": "ok", "payment_timeout": config["PAYMENT_TIMEOUT"]})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        global config
        if self.path == "/admin/apply-demo-fix":
            # This endpoint exists only on the loopback demo service.
            value = config.get("PAYMENT_TIMEOUT_MS")
            if not value:
                self.send_json(409, {"status": "error", "error": "no proposed timeout value"})
                return
            config["PAYMENT_TIMEOUT"] = value
            self.send_json(200, {"status": "fixed", "setting": "PAYMENT_TIMEOUT"})
            return
        if self.path == "/admin/reset":
            config = BROKEN_CONFIG.copy()
            self.send_json(200, {"status": "reset"})
            return
        self.send_json(404, {"error": "not found"})

    def log_message(self, format, *args):
        print(f"[demo-app] {self.address_string()} - {format % args}")


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8080), Handler)
    print("Demo service: http://127.0.0.1:8080/health")
    print("Expected initial state: HTTP 500; ProofPatch can repair this local demo after approval.")
    server.serve_forever()

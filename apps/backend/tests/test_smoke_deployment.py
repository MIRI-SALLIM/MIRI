import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from scripts import smoke_deployment


@pytest.fixture
def smoke_server():
    state = {
        "database": "connected",
        "set_cookie": "mrs_participant=super-secret-cookie; HttpOnly; Path=/",
        "session_payloads": [],
    }

    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, status_code, payload, headers=None):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self._send_json(
                    200,
                    {"status": "ok", "database": state["database"]},
                )
                return
            if self.path == "/api/v1/light/questions?version=light-v1":
                self._send_json(
                    200,
                    {"version": "light-v1", "questions": [{"id": i} for i in range(5)]},
                )
                return
            self._send_json(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/api/v1/sessions":
                self._send_json(404, {"error": "not found"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            state["session_payloads"].append(
                json.loads(self.rfile.read(length).decode("utf-8"))
            )
            self._send_json(
                201,
                {"id": "session-id"},
                {"Set-Cookie": state["set_cookie"]},
            )

        def log_message(self, format, *args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", state
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


def test_smoke_checks_real_http_contract_without_printing_cookie(smoke_server, capsys):
    base_url, state = smoke_server

    smoke_deployment.run_smoke(base_url)

    assert state["session_payloads"] == [
        {"nickname": "deployment-smoke", "mode": "light"}
    ]
    output = capsys.readouterr().out
    assert "health: PASS" in output
    assert "database: PASS" in output
    assert "questions: PASS" in output
    assert "session: PASS" in output
    assert "super-secret-cookie" not in output


def test_smoke_rejects_disconnected_database(smoke_server):
    base_url, state = smoke_server
    state["database"] = "disconnected"

    with pytest.raises(RuntimeError, match="database connection"):
        smoke_deployment.run_smoke(base_url)


def test_smoke_rejects_missing_session_cookie(smoke_server):
    base_url, state = smoke_server
    state["set_cookie"] = ""

    with pytest.raises(RuntimeError, match="session cookie"):
        smoke_deployment.run_smoke(base_url)

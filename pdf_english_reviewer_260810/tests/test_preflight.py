import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

from app.preflight import _check_port, endpoint_is_local_or_approved, run_preflight, storage_is_local


class PreflightPolicyTests(unittest.TestCase):
    def test_external_endpoints_are_blocked(self):
        self.assertTrue(endpoint_is_local_or_approved("http://127.0.0.1:8081/v2/check"))
        self.assertTrue(endpoint_is_local_or_approved("http://localhost:11434/api/chat"))
        self.assertFalse(endpoint_is_local_or_approved("https://api.languagetool.org/v2/check"))
        self.assertFalse(endpoint_is_local_or_approved("http://203.0.113.10:11434/api/chat"))

    def test_cloud_sync_storage_is_blocked(self):
        safe, _ = storage_is_local(Path(tempfile.gettempdir()) / "reviewer-data")
        self.assertTrue(safe)
        unsafe, detail = storage_is_local(Path("C:/Users/Test/OneDrive/reviewer-data"))
        self.assertFalse(unsafe)
        self.assertIn("Cloud-synchronized", detail)

    def test_full_review_requires_cloud_disablement_and_enabled_engines(self):
        root = Path(__file__).resolve().parents[1]
        with patch.dict(os.environ, {"OLLAMA_NO_CLOUD": "0"}, clear=False):
            result = run_preflight(
                root,
                root / "data",
                probe_engines=False,
                check_dependencies=False,
                check_port=False,
            )
        self.assertFalse(result["full_review_ready"])
        checks = {item["key"]: item for item in result["checks"]}
        self.assertNotIn("languagetool", checks)
        self.assertFalse(checks["ollama"]["ready"])
        self.assertFalse(checks["cloud"]["ready"])

    def test_basic_viewer_is_blocked_when_runtime_dependencies_are_missing(self):
        root = Path(__file__).resolve().parents[1]
        with patch(
            "app.preflight._check_dependencies",
            return_value=(False, "Missing Python packages: fastapi"),
        ):
            result = run_preflight(
                root,
                root / "data",
                probe_engines=False,
                check_dependencies=True,
                check_port=False,
            )
        self.assertFalse(result["basic_viewer_ready"])
        self.assertFalse(result["full_review_ready"])

    def test_existing_reviewer_health_endpoint_prevents_duplicate_start(self):
        class HealthHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                payload = b'{"application":"PDF English Reviewer"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_args):
                return

        server = HTTPServer(("127.0.0.1", 0), HealthHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            ready, detail, running = _check_port(server.server_port)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        self.assertTrue(ready)
        self.assertTrue(running)
        self.assertIn("already running", detail)


if __name__ == "__main__":
    unittest.main()

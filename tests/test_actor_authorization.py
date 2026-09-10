"""Actor-role authorization regressions using real local HTTP login sessions.

Run: python -m unittest discover -s tests -p test_actor_authorization.py -v
Own server: 127.0.0.1:8902. All fixtures live under .tmp/rada-auth-regression-*.
"""

import base64
import http.client
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = 8902
FILE_BYTES = b"Rada disposable authorization fixture\n"


class ActorAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Never attach to or stop another agent's server.
        with socket.socket() as probe:
            probe.bind((HOST, PORT))
        parent = ROOT / ".tmp"
        parent.mkdir(exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix="rada-auth-regression-", dir=parent)
        cls.addClassCleanup(cls.temp.cleanup)
        data_dir = Path(cls.temp.name).resolve()
        if not data_dir.is_relative_to(parent.resolve()):
            raise RuntimeError("Synthetic data directory escaped .tmp")
        env = {
            key: value for key, value in os.environ.items()
            if not key.startswith(("APP_", "MAX_", "YANDEX_", "TELEGRAM_", "KONTUR_"))
        }
        env.update({
            "HOST": HOST, "PORT": str(PORT), "APP_DATA_DIR": str(data_dir),
            "STORAGE_PROVIDER": "local", "MAX_TOKEN": "", "YANDEX_DISK_TOKEN": "",
            "KONTUR_EXTERNAL_BASE_URL": f"http://localhost:{PORT}",
            "APP_PUBLIC_URL": f"http://localhost:{PORT}",
            "APP_SESSION_SECRET": "rada-synthetic-regression-session",
            "APP_BASIC_AUTH_USER": "", "APP_BASIC_AUTH_PASSWORD": "",
            "PYTHONDONTWRITEBYTECODE": "1",
            "APP_ACCESS_ACCOUNTS": ";".join([
                "owner|rada-synthetic|1|owner|0",
                "construction_manager|rada-synthetic|2|construction_manager|0",
                "finance_director|rada-synthetic|10|finance_director|0",
                "estimator|rada-synthetic|5|estimator|0",
                "owner_preview|rada-synthetic|1|owner|1",
            ]),
        })
        cls.log = (data_dir / "server.log").open("wb")
        cls.addClassCleanup(cls.log.close)
        cls.process = subprocess.Popen(
            [sys.executable, "-u", str(ROOT / "app" / "server.py")], cwd=ROOT, env=env,
            stdout=cls.log, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        cls.addClassCleanup(cls.stop_server)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                raise RuntimeError("Isolated authorization server exited during startup")
            try:
                if cls.request("GET", "/health")[0] == 200:
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Isolated authorization server did not become healthy")
        cls.cookies = {}
        for role in ("owner", "construction_manager", "finance_director", "estimator", "owner_preview"):
            status, headers, body = cls.request("POST", "/api/login", {
                "login": role, "password": "rada-synthetic",
            })
            if status != 200:
                raise RuntimeError(f"Synthetic login failed: {role}, {status}, {body!r}")
            cookie = SimpleCookie()
            cookie.load(headers["Set-Cookie"])
            cls.cookies[role] = "; ".join(f"{key}={item.value}" for key, item in cookie.items())

    @classmethod
    def stop_server(cls):
        if cls.process.poll() is None:
            cls.process.terminate()
            try:
                cls.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.process.kill()
                cls.process.wait(timeout=5)

    @classmethod
    def request(cls, method, path, payload=None, role=None):
        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("Only local API paths are accepted")
        headers = {}
        if role:
            headers["Cookie"] = cls.cookies[role]
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode("utf-8")
        connection = http.client.HTTPConnection(HOST, PORT, timeout=10)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def setUp(self):
        status, _, body = self.request("GET", "/api/session", role="estimator")
        self.assertEqual(status, 200, body)
        session = json.loads(body)
        self.assertEqual(session["role"], "estimator")
        self.assertEqual(session["user"]["role"], "estimator")
        self.assertEqual(session["user"]["id"], 5)
        self.assertFalse(session["can_switch_role"])

    def variation(self):
        status, _, body = self.request("POST", "/api/variations", {
            "project_id": 1, "title": f"Rada auth regression {time.time_ns()}",
            "type": "additional_work", "amount": 1, "financial_decision": "not_decided",
            "description": "Synthetic local authorization fixture", "actor_id": 1,
        }, role="owner")
        self.assertEqual(status, 201, body)
        return json.loads(body)["id"]

    def variation_state(self, variation_id):
        status, _, body = self.request("GET", "/api/variations", role="owner")
        self.assertEqual(status, 200, body)
        return next(row for row in json.loads(body) if row["id"] == variation_id)

    def document(self):
        status, _, body = self.request("POST", "/api/documents", {
            "related_type": "knowledge_base", "type": "instruction",
            "title": f"Rada disposable document {time.time_ns()}",
            "document_file": {
                "file_name": "rada-authorization.txt", "mime_type": "text/plain",
                "file_base64": base64.b64encode(FILE_BYTES).decode("ascii"),
            },
        }, role="owner")
        self.assertEqual(status, 201, body)
        return json.loads(body)["id"]

    def latest_variation_event(self, variation_id):
        title = self.variation_state(variation_id)["title"]
        status, _, body = self.request("GET", "/api/events", role="owner")
        self.assertEqual(status, 200, body)
        events = [row for row in json.loads(body) if title in row.get("text", "")]
        self.assertTrue(events, "Expected an attributed variation event")
        return max(events, key=lambda row: row["id"])

    def test_estimator_cannot_approve_or_reject_by_forging_actor_role(self):
        for action in ("approve", "reject"):
            with self.subTest(action=action):
                variation_id = self.variation()
                before = self.variation_state(variation_id)
                for claimed_role in ("estimator", "owner", "construction_manager", "finance_director"):
                    with self.subTest(claimed_role=claimed_role):
                        status, _, body = self.request("POST", f"/api/variations/{variation_id}/{action}", {
                            "actor_role": claimed_role, "actor_id": 5,
                            "financial_decision": "company", "comment": "Rada role check",
                        }, role="estimator")
                        self.assertIn(status, (400, 403), body)
                        self.assertEqual(self.variation_state(variation_id), before)

    def test_estimator_cannot_delete_knowledge_file_by_forging_actor_role(self):
        document_id = self.document()
        for claimed_role in ("estimator", "owner", "construction_manager"):
            with self.subTest(claimed_role=claimed_role):
                status, _, body = self.request("POST", f"/api/documents/{document_id}/delete", {
                    "actor_role": claimed_role,
                }, role="estimator")
                self.assertIn(status, (400, 403), body)
                status, _, raw = self.request("GET", f"/api/documents/{document_id}/download", role="owner")
                self.assertEqual((status, raw), (200, FILE_BYTES))

    def test_existing_director_allowlist_can_approve_and_reject(self):
        for role in ("owner", "construction_manager", "finance_director"):
            for action, expected in (("approve", "approved"), ("reject", "rejected")):
                with self.subTest(role=role, action=action):
                    variation_id = self.variation()
                    status, _, body = self.request("POST", f"/api/variations/{variation_id}/{action}", {
                        "actor_role": role, "financial_decision": "company", "comment": "Rada legitimate director",
                    }, role=role)
                    self.assertEqual(status, 200, body)
                    self.assertEqual(self.variation_state(variation_id)["status"], expected)

    def test_existing_director_allowlist_can_delete_knowledge_files(self):
        for role in ("owner", "construction_manager"):
            with self.subTest(role=role):
                document_id = self.document()
                status, _, body = self.request("POST", f"/api/documents/{document_id}/delete", {
                    "actor_role": role,
                }, role=role)
                self.assertEqual(status, 200, body)
                self.assertEqual(self.request("GET", f"/api/documents/{document_id}/download", role="owner")[0], 404)

    def test_estimator_review_uses_authenticated_author_not_forged_actor_id(self):
        variation_id = self.variation()
        status, _, body = self.request("POST", f"/api/variations/{variation_id}/review", {
            "actor_role": "owner", "actor_id": 1,
        }, role="estimator")
        self.assertEqual(status, 200, body)
        self.assertEqual(self.variation_state(variation_id)["status"], "in_review")
        self.assertEqual(self.latest_variation_event(variation_id)["author_id"], 5)

    def test_owner_role_preview_preserves_selected_controls_and_attribution(self):
        status, _, body = self.request("GET", "/api/session", role="owner_preview")
        self.assertEqual(status, 200, body)
        session = json.loads(body)
        self.assertEqual(session["role"], "owner")
        self.assertEqual(session["user"]["id"], 1)
        self.assertTrue(session["can_switch_role"])
        variation_id = self.variation()
        before = self.variation_state(variation_id)
        status, _, body = self.request("POST", f"/api/variations/{variation_id}/approve", {
            "actor_role": "estimator", "actor_id": 5,
        }, role="owner_preview")
        self.assertIn(status, (400, 403), body)
        self.assertEqual(self.variation_state(variation_id), before)
        status, _, body = self.request("POST", f"/api/variations/{variation_id}/approve", {
            "actor_role": "construction_manager", "actor_id": 2,
            "financial_decision": "company",
        }, role="owner_preview")
        self.assertEqual(status, 200, body)
        self.assertEqual(self.latest_variation_event(variation_id)["author_id"], 2)
        fallback_id = self.variation()
        status, _, body = self.request("POST", f"/api/variations/{fallback_id}/approve", {}, role="owner_preview")
        self.assertEqual(status, 200, body)
        self.assertEqual(self.latest_variation_event(fallback_id)["author_id"], 1)
        document_id = self.document()
        status, _, body = self.request("POST", f"/api/documents/{document_id}/delete", {
            "actor_role": "estimator",
        }, role="owner_preview")
        self.assertIn(status, (400, 403), body)
        self.assertEqual(self.request("GET", f"/api/documents/{document_id}/download", role="owner")[2], FILE_BYTES)
        status, _, body = self.request("POST", f"/api/documents/{document_id}/delete", {
            "actor_role": "construction_manager",
        }, role="owner_preview")
        self.assertEqual(status, 200, body)
        self.assertEqual(self.request("GET", f"/api/documents/{document_id}/download", role="owner")[0], 404)


if __name__ == "__main__":
    unittest.main()

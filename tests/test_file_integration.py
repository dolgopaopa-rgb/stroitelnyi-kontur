"""Real HTTP/SQLite file regression tests; all state stays in .tmp/anna.

Run: python -m unittest discover -s tests -p test_file_integration.py -v
The Yandex fixture uses loopback HTTP for metadata and file bytes, never the cloud.
"""

import base64
import contextlib
import http.client
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
ZIP = b"PK\x05\x06" + b"\x00" * 18


def file_payload(name, raw, mime):
    return {"file_name": name, "file_base64": base64.b64encode(raw).decode("ascii"), "mime_type": mime}


class FileIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parent = ROOT / ".tmp" / "anna"
        parent.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix="files-", dir=parent)
        cls.data_dir = Path(cls.temp.name).resolve()
        cls.env = patch.dict(os.environ, {
            "APP_DATA_DIR": str(cls.data_dir), "STORAGE_PROVIDER": "local",
            "MAX_TOKEN": "", "YANDEX_DISK_TOKEN": "", "APP_PUBLIC_URL": "http://localhost:8898",
            "KONTUR_EXTERNAL_BASE_URL": "http://localhost:8898", "APP_SESSION_SECRET": "anna-synthetic",
            "APP_BASIC_AUTH_USER": "", "APP_BASIC_AUTH_PASSWORD": "",
            "APP_ACCESS_ACCOUNTS": "anna|synthetic|1|owner;auditor|synthetic|1|ai_auditor;foreman|synthetic|7|foreman",
        })
        cls.env.start()
        sys.path.insert(0, str(ROOT / "app"))
        import server
        cls.app = server
        if server.DATA_DIR.resolve() != cls.data_dir:
            raise RuntimeError("Refusing to test against a previously imported non-isolated database")
        server.init_db()
        cls.errors = []

        class IsolatedServer(ThreadingHTTPServer):
            def handle_error(self, request, client_address):
                cls.errors.append(str(sys.exception()))

        cls.httpd = IsolatedServer(("127.0.0.1", 8898), server.AppHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(5)
        cls.env.stop()
        # SQLite context managers do not close connections; collect them before Windows cleanup.
        import gc
        gc.collect()
        cls.temp.cleanup()

    def request(self, method, path, payload=None, *, user="anna", headers=None, raw=None, timeout=10):
        request_headers = dict(headers or {})
        if user:
            request_headers["Authorization"] = "Basic " + base64.b64encode(f"{user}:synthetic".encode()).decode()
        if payload is not None:
            raw = json.dumps(payload).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        connection = http.client.HTTPConnection("127.0.0.1", 8898, timeout=timeout)
        try:
            connection.request(method, path, body=raw, headers=request_headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def document(self, name="test.png", raw=PNG, mime="image/png"):
        status, _, body = self.request("POST", "/api/documents", {
            "project_id": 1, "title": name, "type": "other", "document_file": file_payload(name, raw, mime),
        })
        self.assertEqual(status, 201, body)
        return json.loads(body)["id"]

    def job(self, status="estimate_done"):
        with contextlib.closing(self.app.connect()) as db, db:
            result = db.execute(
                "INSERT INTO estimate_jobs (title, customer_name, status, manager_id, estimator_id, project_id) VALUES (?, ?, ?, 3, 5, 1)",
                ("Anna synthetic files", "Synthetic", status),
            )
            return result.lastrowid

    def test_document_png_pdf_unicode_round_trip_and_head(self):
        for name, raw, mime in [("photo.png", PNG, "image/png"), ("plan.pdf", PDF, "application/pdf"),
                                ("\u041f\u043b\u0430\u043d \u044d\u0442\u0430\u0436\u0430 (2).pdf", PDF, "application/pdf"),
                                ("\u0447\u0435\u0440\u0442\u0451\u0436_\u0401.zip", ZIP, "application/zip")]:
            with self.subTest(name=name):
                file_id = self.document(name, raw, mime)
                status, _, body = self.request("GET", "/api/documents")
                self.assertEqual(status, 200)
                listed = next(item for item in json.loads(body) if item["id"] == file_id)
                self.assertEqual(listed["file_name"], name)
                self.assertEqual(listed["file_size"], len(raw))
                url = f"/api/documents/{file_id}/download"
                status, headers, body = self.request("GET", url)
                self.assertEqual((status, body), (200, raw))
                self.assertEqual(headers["Content-Type"], mime)
                self.assertIn("filename*=UTF-8''" + quote(name), headers["Content-Disposition"])
                status, headers, body = self.request("HEAD", url)
                self.assertEqual((status, body), (200, b""))
                self.assertEqual(int(headers["Content-Length"]), len(raw))

    def test_local_ranges(self):
        url = f"/api/documents/{self.document()}/download"
        for value, expected in [("bytes=0-7", PNG[:8]), ("bytes=-6", PNG[-6:]), ("bytes=8-", PNG[8:])]:
            status, headers, body = self.request("GET", url, headers={"Range": value})
            self.assertEqual((status, body), (206, expected))
            self.assertEqual(int(headers["Content-Length"]), len(expected))
        status, headers, body = self.request("GET", url, headers={"Range": "bytes=99999-"})
        self.assertEqual((status, body), (416, b""))
        self.assertEqual(headers["Content-Range"], f"bytes */{len(PNG)}")

    def test_authorization_existing_contract(self):
        file_id = self.document()
        job_id = self.job()
        payload = {"attachments": [file_payload("test.pdf", PDF, "application/pdf")]}
        status, _, body = self.request("POST", f"/api/estimate-jobs/{job_id}/files", payload)
        self.assertEqual(status, 200, body)
        estimate_file_id = json.loads(body)["files"][0]
        for route in [f"/api/documents/{file_id}/download", f"/api/estimate-job-files/{estimate_file_id}/download"]:
            for method in ["GET", "HEAD"]:
                self.assertEqual(self.request(method, route, user=None)[0], 401)
                self.assertEqual(self.request(method, route, user="auditor")[0], 403)
        for user, expected in [(None, 401), ("auditor", 403), ("foreman", 403)]:
            self.assertEqual(self.request("POST", f"/api/estimate-jobs/{job_id}/files", payload, user=user)[0], expected)
        self.assertEqual(self.request("GET", f"/api/estimate-job-files/{estimate_file_id}/download", user="foreman")[0], 403)

    def test_empty_malformed_and_multipart_existing_contract(self):
        job_id = self.job()
        url = f"/api/estimate-jobs/{job_id}/files"
        for payload in [{"attachments": []}, {"attachments": [file_payload("empty.pdf", b"", "application/pdf")]}]:
            self.assertEqual(self.request("POST", url, payload)[0], 400)
        status, _, body = self.request("POST", url, raw=b"--test\r\ninvalid multipart\r\n--test--", headers={"Content-Type": "multipart/form-data; boundary=test"})
        self.assertEqual(status, 400, body)
        self.assertEqual(self.request("POST", url, raw=b"{", headers={"Content-Type": "application/json"})[0], 400)
        self.assertEqual(self.request("GET", "/api/estimate-job-files/999999/download")[0], 404)

    def test_large_payload_no_existing_application_size_limit(self):
        raw = (bytes(range(256)) * (8 * 1024 * 1024 // 256))
        file_id = self.document("large.pdf", raw, "application/pdf")
        self.assertEqual(self.request("GET", f"/api/documents/{file_id}/download")[2], raw)

    def test_photo_report_rejects_non_media_and_malformed_bytes_atomically(self):
        invalid_files = [
            file_payload("wrong.txt", b"text", "text/plain"),
            file_payload("wrong.txt", PNG, "image/png"),
            file_payload("wrong.png", PNG, "text/plain"),
            file_payload("wrong.png", PNG, "video/mp4"),
            {"file_name": "wrong.png", "file_base64": "%%%", "mime_type": "image/png"},
            {"file_name": "empty.png", "file_base64": "data:image/png;base64,", "mime_type": "image/png"},
        ]
        for invalid in invalid_files:
            with self.subTest(file=invalid["file_name"], mime=invalid["mime_type"]):
                with contextlib.closing(self.app.connect()) as db:
                    counts = tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ["documents", "photo_reports"])
                status, _, body = self.request("POST", "/api/photo-reports", {
                    "project_id": 1, "comment": str(uuid4()),
                    "attachments": [file_payload("good.png", PNG, "image/png"), invalid],
                })
                self.assertEqual(status, 400, body)
                with contextlib.closing(self.app.connect()) as db:
                    after = tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ["documents", "photo_reports"])
                self.assertEqual(after, counts)

    def test_photo_report_media_upload_list_download(self):
        for name, mime in [("photo.png", "image/png"), ("photo.png", ""), ("photo.png", "image/jpeg"), ("photo.heic", "application/octet-stream")]:
            with self.subTest(name=name, mime=mime):
                status, _, body = self.request("POST", "/api/photo-reports", {
                    "project_id": 1, "comment": str(uuid4()),
                    "attachments": [file_payload(name, PNG, mime)],
                })
                self.assertEqual(status, 201, body)
                result = json.loads(body)
                file_id = result["documents"][0]
                self.assertEqual(self.request("GET", f"/api/documents/{file_id}/download")[2], PNG)
                status, _, body = self.request("GET", "/api/photo-reports")
                self.assertEqual(status, 200, body)
                report = next(item for item in json.loads(body) if item["id"] == result["id"])
                self.assertEqual(report["attachments"][0]["id"], file_id)
                self.assertTrue(report["attachments"][0]["mime_type"].startswith("image/"))

    def test_negative_content_length_rejected_without_waiting_for_eof(self):
        status, _, body = self.request("POST", "/api/documents", raw=b"", headers={"Content-Length": "-1"}, timeout=1)
        self.assertEqual(status, 400, body)

    def test_zero_byte_stored_file_download(self):
        file_id = self.document()
        with contextlib.closing(self.app.connect()) as db:
            path = db.execute("SELECT file_path FROM documents WHERE id = ?", (file_id,)).fetchone()[0]
        (self.data_dir / path).write_bytes(b"")
        status, headers, body = self.request("GET", f"/api/documents/{file_id}/download")
        self.assertEqual((status, body, headers["Content-Length"]), (200, b"", "0"))

    def test_same_millisecond_same_name_does_not_overwrite(self):
        job_id = self.job()
        with patch.object(self.app.time, "time", return_value=1800000000):
            status, _, body = self.request("POST", f"/api/estimate-jobs/{job_id}/files", {
                "attachments": [file_payload("same.pdf", PDF, "application/pdf"), file_payload("same.pdf", PDF + b"second", "application/pdf")],
            })
        self.assertEqual(status, 200, body)
        ids = json.loads(body)["files"]
        self.assertEqual(len(ids), 2)
        for file_id, expected in zip(ids, [PDF, PDF + b"second"]):
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file_id}/download")[2], expected)

    def test_idle_archive_does_not_block_get_behind_writer(self):
        with contextlib.closing(self.app.connect()) as db, db:
            db.execute("UPDATE material_request_batches SET archived_at = CURRENT_TIMESTAMP WHERE archived_at IS NULL")
        with contextlib.closing(self.app.connect()) as writer:
            writer.execute("BEGIN IMMEDIATE")
            try:
                started = time.monotonic()
                for route in ["/api/session", "/api/documents", "/api/estimate-jobs"]:
                    status, _, body = self.request("GET", route)
                    self.assertEqual(status, 200, body)
                self.assertLess(time.monotonic() - started, 2)
            finally:
                writer.rollback()

    @contextlib.contextmanager
    def loopback_storage(self, *, pause_second=False, failure=None, truncate=False, upload_failure=None):
        app = self.app
        objects = {}
        self.loopback_objects = objects
        uploads = []
        entered = threading.Event()
        release = threading.Event()
        original_save = app.save_uploaded_file

        class DiskHandler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                parsed = urlparse(self.path)
                path = parse_qs(parsed.query).get("path", [""])[0]
                if parsed.path == "/content":
                    if failure:
                        self.send_error(failure)
                        return
                    raw = objects[path]
                else:
                    raw = json.dumps({"href": f"http://127.0.0.1:{self.server.server_port}/content?{urlencode({'path': path})}"}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(raw) + (10 if truncate and parsed.path == "/content" else 0)))
                self.end_headers()
                self.wfile.write(raw)

            def do_PUT(self):
                parsed = urlparse(self.path)
                if parsed.path == "/content":
                    raw = self.rfile.read(int(self.headers["Content-Length"]))
                    if upload_failure:
                        self.send_error(upload_failure)
                        return
                    if pause_second and len(objects) == 1:
                        entered.set()
                        if not release.wait(15):
                            self.send_error(504)
                            return
                    path = parse_qs(parsed.query)["path"][0]
                    objects[path] = raw
                self.send_response(201)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_DELETE(self):
                path = parse_qs(urlparse(self.path).query)["path"][0]
                objects.pop(path, None)
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()

        disk = ThreadingHTTPServer(("127.0.0.1", 0), DiskHandler)
        disk_thread = threading.Thread(target=disk.serve_forever, daemon=True)
        disk_thread.start()

        def api_request(method, resource, params=None):
            url = f"http://127.0.0.1:{disk.server_port}{resource}?{urlencode(params or {})}"
            with urlopen(Request(url, method=method), timeout=10) as response:
                return json.loads(response.read() or b"{}")

        def save_file(db, *args, **kwargs):
            uploads.append(db.in_transaction)
            if upload_failure:
                # Exercise the real local fallback, with only the provider selector overridden.
                with patch.object(app, "yandex_disk_configured", return_value=True):
                    return original_save(db, *args, **kwargs)
            return app.upload_to_yandex_disk(db, *args, **kwargs)

        try:
            with patch.object(app, "yandex_api_request", api_request), patch.object(app, "save_uploaded_file", save_file):
                yield uploads, entered, release
        finally:
            release.set()
            disk.shutdown()
            disk.server_close()
            disk_thread.join(5)

    def test_slow_batch_transfer_releases_writer_and_round_trips(self):
        job_id = self.job()
        payload = {"result_comment": "synthetic comment", "attachments": [
            file_payload("\u041f\u043b\u0430\u043d.pdf", PDF, "application/pdf"), file_payload("photo.png", PNG, "image/png"),
        ]}
        result = []
        with self.loopback_storage(pause_second=True) as (transactions, entered, release):
            upload_thread = threading.Thread(target=lambda: result.append(self.request("POST", f"/api/estimate-jobs/{job_id}/files", payload)))
            upload_thread.start()
            try:
                self.assertTrue(entered.wait(10), "Second file never reached the loopback provider")
                with contextlib.closing(sqlite3.connect(self.app.DB_PATH, timeout=0.2)) as writer:
                    writer.execute("BEGIN IMMEDIATE")
                    writer.execute("UPDATE projects SET title = title WHERE id = 1")
                    writer.commit()
                self.assertEqual(self.request("GET", "/api/estimate-jobs")[0], 200)
            finally:
                release.set()
                upload_thread.join(15)
            self.assertFalse(upload_thread.is_alive())
            self.assertEqual(transactions, [False, False])
            status, _, body = result[0]
            self.assertEqual(status, 200, body)
            ids = json.loads(body)["files"]
            for file_id, raw in zip(ids, [PDF, PNG]):
                self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file_id}/download")[2], raw)
            _, _, body = self.request("GET", "/api/estimate-jobs")
            listed = next(job for job in json.loads(body) if job["id"] == job_id)
            self.assertEqual({file["id"] for file in listed["files"]}, set(ids))
            self.assertEqual(listed["result_comment"], "synthetic comment")

    def test_upstream_download_error_stays_502(self):
        job_id = self.job()
        with self.loopback_storage(failure=503):
            status, _, body = self.request("POST", f"/api/estimate-jobs/{job_id}/files", {"attachments": [file_payload("test.pdf", PDF, "application/pdf")]})
            self.assertEqual(status, 200, body)
            file_id = json.loads(body)["files"][0]
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file_id}/download")[0], 502)

    def test_truncated_upstream_download_returns_502_not_connection_drop(self):
        job_id = self.job()
        with self.loopback_storage(truncate=True):
            status, _, body = self.request("POST", f"/api/estimate-jobs/{job_id}/files", {"attachments": [file_payload("test.pdf", PDF, "application/pdf")]})
            self.assertEqual(status, 200, body)
            file_id = json.loads(body)["files"][0]
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file_id}/download")[0], 502)

    def test_replacement_keeps_old_bytes_and_increments_version(self):
        job_id = self.job()
        url = f"/api/estimate-jobs/{job_id}/files"
        _, _, body = self.request("POST", url, {"attachments": [file_payload("v1.pdf", PDF, "application/pdf")]})
        old_id = json.loads(body)["files"][0]
        status, _, body = self.request("POST", url, {"replace_file_id": old_id, "replacement_note": "synthetic", "attachments": [file_payload("v2.pdf", PDF + b"v2", "application/pdf")]})
        self.assertEqual(status, 200, body)
        new_id = json.loads(body)["files"][0]
        self.assertEqual(self.request("GET", f"/api/estimate-job-files/{old_id}/download")[2], PDF)
        self.assertEqual(self.request("GET", f"/api/estimate-job-files/{new_id}/download")[2], PDF + b"v2")
        with contextlib.closing(self.app.connect()) as db:
            old = db.execute("SELECT * FROM estimate_job_files WHERE id = ?", (old_id,)).fetchone()
            new = db.execute("SELECT * FROM estimate_job_files WHERE id = ?", (new_id,)).fetchone()
        self.assertEqual(old["is_current"], 0)
        self.assertEqual((new["is_current"], new["version_no"], new["replaced_file_id"]), (1, 2, old_id))

    def test_status_submission_transfers_before_update(self):
        job_id = self.job("estimate_in_work")
        with self.loopback_storage() as (transactions, _, _):
            status, _, body = self.request("POST", f"/api/estimate-jobs/{job_id}/status", {
                "status": "estimate_done", "attachments": [file_payload("plan.pdf", PDF, "application/pdf"), file_payload("photo.png", PNG, "image/png")],
            })
            self.assertEqual(status, 200, body)
            self.assertEqual(transactions, [False, False])
        with contextlib.closing(self.app.connect()) as db:
            row = db.execute("SELECT status FROM estimate_jobs WHERE id = ?", (job_id,)).fetchone()
            self.assertEqual(row[0], "estimate_done")
            self.assertEqual(db.execute("SELECT count(*) FROM estimate_job_files WHERE estimate_job_id = ?", (job_id,)).fetchone()[0], 2)

    def test_concurrent_replacements_only_one_can_replace_current_version(self):
        job_id = self.job()
        route = f"/api/estimate-jobs/{job_id}/files"
        status, _, body = self.request("POST", route, {"attachments": [file_payload("v1.pdf", PDF, "application/pdf")]})
        self.assertEqual(status, 200, body)
        old_id = json.loads(body)["files"][0]
        with contextlib.closing(self.app.connect()) as db:
            before_events = db.execute("SELECT count(*) FROM events").fetchone()[0]
            before_jobs = db.execute("SELECT count(*) FROM estimate_jobs").fetchone()[0]
        payloads = [
            {"replace_file_id": old_id, "result_comment": note, "replacement_note": note,
             "attachments": [file_payload("v2.pdf", PDF + note.encode(), "application/pdf")]}
            for note in ["concurrent A", "concurrent B"]
        ]
        barrier = threading.Barrier(2)
        original_prepare = self.app.prepare_estimate_job_file

        def prepare(db, *args, **kwargs):
            prepared = original_prepare(db, *args, **kwargs)
            barrier.wait(8)
            return prepared

        with self.loopback_storage() as (transactions, _, _):
            with patch.object(self.app, "prepare_estimate_job_file", prepare), ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda payload: self.request("POST", route, payload, timeout=20), payloads))
            self.assertEqual(transactions, [False, False])
            self.assertEqual(sorted(result[0] for result in results), [200, 400], results)
            winner = next(index for index, result in enumerate(results) if result[0] == 200)
            new_id = json.loads(results[winner][2])["files"][0]
            self.assertTrue(json.loads(results[1 - winner][2])["error"])
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{old_id}/download")[2], PDF)
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{new_id}/download")[2], PDF + payloads[winner]["replacement_note"].encode())
        with contextlib.closing(self.app.connect()) as db:
            files = db.execute("SELECT * FROM estimate_job_files WHERE estimate_job_id = ? ORDER BY id", (job_id,)).fetchall()
            self.assertEqual(len(files), 2)
            self.assertEqual((files[0]["id"], files[0]["is_current"], files[0]["version_no"]), (old_id, 0, 1))
            self.assertEqual((files[1]["id"], files[1]["is_current"], files[1]["version_no"], files[1]["replaced_file_id"]), (new_id, 1, 2, old_id))
            self.assertEqual(files[0]["replacement_note"], payloads[winner]["replacement_note"])
            self.assertEqual(db.execute("SELECT result_comment FROM estimate_jobs WHERE id = ?", (job_id,)).fetchone()[0], payloads[winner]["result_comment"])
            self.assertEqual(db.execute("SELECT count(*) FROM events").fetchone()[0], before_events + 1)
            self.assertEqual(db.execute("SELECT count(*) FROM estimate_jobs").fetchone()[0], before_jobs)

    def test_invalid_replacement_does_not_update_comment(self):
        job_id = self.job()
        status, _, body = self.request("POST", f"/api/estimate-jobs/{job_id}/files", {
            "replace_file_id": 999999, "result_comment": "must not persist",
            "attachments": [file_payload("plan.pdf", PDF, "application/pdf")],
        })
        self.assertEqual(status, 404, body)
        with contextlib.closing(self.app.connect()) as db:
            self.assertNotEqual(db.execute("SELECT result_comment FROM estimate_jobs WHERE id = ?", (job_id,)).fetchone()[0], "must not persist")

    def test_archive_semantics_and_commit_before_get_response(self):
        with contextlib.closing(self.app.connect()) as db, db:
            result = db.execute(
                "INSERT INTO material_request_batches (project_id, status, stage, health, received_at) VALUES (1, 'received', 'cancelled', 'problem', datetime('now', '-3 days'))"
            )
            batch_id = result.lastrowid
        commits = []
        original = self.app.json_response

        def observe_response(handler, *args, **kwargs):
            with contextlib.closing(sqlite3.connect(self.app.DB_PATH, timeout=0.2)) as writer:
                writer.execute("BEGIN IMMEDIATE")
                writer.rollback()
            commits.append(True)
            return original(handler, *args, **kwargs)

        with patch.object(self.app, "json_response", observe_response):
            self.assertEqual(self.request("GET", "/api/session")[0], 200)
        self.assertEqual(commits, [True])
        with contextlib.closing(self.app.connect()) as db:
            row = db.execute("SELECT archived_at, stage, health FROM material_request_batches WHERE id = ?", (batch_id,)).fetchone()
        self.assertIsNotNone(row["archived_at"])
        self.assertEqual((row["stage"], row["health"]), ("cancelled", "problem"))

    def job_payload(self):
        return {"title": "Anna upload " + str(uuid4()), "customer_name": "Synthetic",
                "project_id": 1, "manager_id": 3, "estimator_id": 5, "received_at": "2026-09-10",
                "due_date": "2026-09-11", "site_costs_policy": "include",
                "attachments": [file_payload("plan.pdf", PDF, "application/pdf"), file_payload("photo.png", PNG, "image/png")]}

    def test_creation_and_update_slow_upload_leave_database_available(self):
        for action in ["create", "update", "status"]:
            with self.subTest(action=action):
                payload = self.job_payload()
                job_id = None if action == "create" else self.job("estimate_in_work")
                path = "/api/estimate-jobs" if action == "create" else f"/api/estimate-jobs/{job_id}/{action}"
                if action == "status":
                    payload["status"] = "estimate_done"
                result = []
                with self.loopback_storage(pause_second=True) as (transactions, entered, release):
                    upload_thread = threading.Thread(target=lambda: result.append(self.request("POST", path, payload)))
                    upload_thread.start()
                    try:
                        self.assertTrue(entered.wait(10))
                        with contextlib.closing(sqlite3.connect(self.app.DB_PATH, timeout=0.2)) as writer:
                            writer.execute("BEGIN IMMEDIATE")
                            writer.execute("UPDATE projects SET title = title WHERE id = 1")
                            writer.commit()
                        status, _, body = self.request("GET", "/api/estimate-jobs")
                        self.assertEqual(status, 200, body)
                        jobs = json.loads(body)
                        if action == "create":
                            self.assertFalse(any(job["title"] == payload["title"] for job in jobs))
                        else:
                            job = next(job for job in jobs if job["id"] == job_id)
                            self.assertEqual(job["status"], "estimate_in_work")
                            self.assertNotEqual(job["title"], payload["title"])
                            self.assertEqual(job["files"], [])
                    finally:
                        release.set()
                        upload_thread.join(15)
                    self.assertEqual(transactions, [False, False])
                    self.assertFalse(upload_thread.is_alive())
                    status, _, body = result[0]
                    self.assertEqual(status, 201 if action == "create" else 200, body)
                    job_id = json.loads(body)["id"]
                    _, _, body = self.request("GET", "/api/estimate-jobs")
                    job = next(job for job in json.loads(body) if job["id"] == job_id)
                    self.assertEqual(len(job["files"]), 2)
                    files = {item["file_name"]: item for item in job["files"]}
                    for name, raw in [("plan.pdf", PDF), ("photo.png", PNG)]:
                        file = files[name]
                        self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file['id']}/download")[2], raw)
                        if action != "status":
                            self.assertIn(payload["title"], file["file_path"])

    def test_new_job_local_files_have_final_job_directory(self):
        status, _, body = self.request("POST", "/api/estimate-jobs", self.job_payload())
        self.assertEqual(status, 201, body)
        job_id = json.loads(body)["id"]
        with contextlib.closing(self.app.connect()) as db:
            files = db.execute("SELECT * FROM estimate_job_files WHERE estimate_job_id = ? ORDER BY id", (job_id,)).fetchall()
        self.assertEqual(len(files), 2)
        for file, expected in zip(files, [PDF, PNG]):
            self.assertEqual((self.data_dir / file["file_path"]).parent, self.app.UPLOAD_DIR / f"project_{job_id}")
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file['id']}/download")[2], expected)

    def test_photo_known_types_do_not_depend_on_os_mime_database(self):
        formats = [("photo.jfif", "image/jpeg"), ("photo.heic", "image/heic"), ("photo.heif", "image/heif"),
                   ("clip.mov", "video/quicktime"), ("clip.mp4", "video/mp4"), ("clip.webm", "video/webm"), ("clip.m4v", "video/x-m4v")]
        # These synthetic bytes test transport and MIME admission, not codec/browser decoding.
        with patch.object(self.app.mimetypes, "guess_type", return_value=(None, None)):
            for name, mime in formats:
                with self.subTest(name=name):
                    raw = b"Anna synthetic media container " + name.encode()
                    status, _, body = self.request("POST", "/api/photo-reports", {
                        "project_id": 1, "report_date": "2026-09-10", "comment": str(uuid4()),
                        "attachments": [file_payload(name, raw, mime)],
                    })
                    self.assertEqual(status, 201, body)
                    file_id = json.loads(body)["documents"][0]
                    status, headers, downloaded = self.request("GET", f"/api/documents/{file_id}/download")
                    self.assertEqual((status, downloaded, headers["Content-Type"]), (200, raw, mime))

    def test_failed_cloud_upload_falls_back_locally_for_new_job(self):
        with self.loopback_storage(upload_failure=503) as (transactions, _, _):
            status, _, body = self.request("POST", "/api/estimate-jobs", self.job_payload())
        self.assertEqual(status, 201, body)
        self.assertEqual(transactions, [False, False])
        job_id = json.loads(body)["id"]
        with contextlib.closing(self.app.connect()) as db:
            files = db.execute("SELECT * FROM estimate_job_files WHERE estimate_job_id = ? ORDER BY id", (job_id,)).fetchall()
        self.assertEqual(len(files), 2)
        for file, expected in zip(files, [PDF, PNG]):
            self.assertFalse(file["file_path"].startswith("yadisk:"))
            self.assertEqual((self.data_dir / file["file_path"]).parent, self.app.UPLOAD_DIR / f"project_{job_id}")
            self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file['id']}/download")[2], expected)

    def test_failed_job_insert_keeps_all_metadata_atomic(self):
        with contextlib.closing(self.app.connect()) as db:
            before = tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ["estimate_jobs", "estimate_job_files"])
        payload = self.job_payload()
        payload["manager_id"] = 999999
        status, _, body = self.request("POST", "/api/estimate-jobs", payload)
        self.assertEqual(status, 400, body)
        with contextlib.closing(self.app.connect()) as db:
            after = tuple(db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in ["estimate_jobs", "estimate_job_files"])
        self.assertEqual(after, before)

    def test_simultaneous_new_jobs_keep_same_named_files_separate(self):
        barrier = threading.Barrier(2)
        original_prepare = self.app.prepare_estimate_job_file
        observed = []

        def prepare(db, job_id, item, **kwargs):
            result = original_prepare(db, job_id, item, **kwargs)
            observed.append(db.in_transaction)
            if item["file_name"] == "plan.pdf":
                barrier.wait(5)
            return result

        payloads = [self.job_payload(), self.job_payload()]
        payloads[1]["attachments"] = [file_payload("plan.pdf", PDF + b"second job", "application/pdf"), file_payload("photo.png", PNG + b"second job", "image/png")]
        with patch.object(self.app, "prepare_estimate_job_file", prepare), ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.request, "POST", "/api/estimate-jobs", payload) for payload in payloads]
            results = [future.result(timeout=15) for future in futures]
        self.assertEqual(observed, [False] * 4)
        ids = []
        stored_paths = []
        for result, payload in zip(results, payloads):
            status, _, body = result
            self.assertEqual(status, 201, body)
            job_id = json.loads(body)["id"]
            ids.append(job_id)
            with contextlib.closing(self.app.connect()) as db:
                files = db.execute("SELECT * FROM estimate_job_files WHERE estimate_job_id = ? ORDER BY id", (job_id,)).fetchall()
            self.assertEqual(len(files), 2)
            for file, uploaded in zip(files, payload["attachments"]):
                stored_paths.append(file["file_path"])
                self.assertEqual((self.data_dir / file["file_path"]).parent, self.app.UPLOAD_DIR / f"project_{job_id}")
                expected = base64.b64decode(uploaded["file_base64"])
                self.assertEqual(self.request("GET", f"/api/estimate-job-files/{file['id']}/download")[2], expected)
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual(len(set(stored_paths)), 4)

    def pending_batch(self):
        with contextlib.closing(self.app.connect()) as db, db:
            return db.execute(
                "INSERT INTO material_request_batches (project_id, status, stage, health, received_at) VALUES (1, 'received', 'received', 'problem', datetime('now', '-3 days'))"
            ).lastrowid

    def test_pending_archive_defers_busy_writer_and_retries_next_get(self):
        batch_id = self.pending_batch()
        with contextlib.closing(self.app.connect()) as writer:
            writer.execute("BEGIN IMMEDIATE")
            try:
                started = time.monotonic()
                for route in ["/api/session", "/api/material-requests/export"]:
                    status, _, body = self.request("GET", route)
                    self.assertEqual(status, 200, body)
                self.assertLess(time.monotonic() - started, 2)
                row = writer.execute("SELECT archived_at, stage FROM material_request_batches WHERE id = ?", (batch_id,)).fetchone()
                self.assertEqual((row["archived_at"], row["stage"]), (None, "received"))
            finally:
                writer.rollback()
        self.assertEqual(self.request("GET", "/api/session")[0], 200)
        with contextlib.closing(self.app.connect()) as db:
            row = db.execute("SELECT archived_at, stage, health FROM material_request_batches WHERE id = ?", (batch_id,)).fetchone()
        self.assertIsNotNone(row["archived_at"])
        self.assertEqual((row["stage"], row["health"]), ("closed", "problem"))

    def test_read_maintenance_propagates_non_busy_database_error_and_restores_timeout(self):
        batch_id = self.pending_batch()
        with contextlib.closing(self.app.connect()) as db:
            timeout = db.execute("PRAGMA busy_timeout").fetchone()[0]
            db.execute("PRAGMA query_only = ON")
            with self.assertRaises(sqlite3.OperationalError) as raised:
                self.app.archive_material_batches_for_read(db)
            self.assertEqual(raised.exception.sqlite_errorcode, sqlite3.SQLITE_READONLY)
            self.assertEqual(db.execute("PRAGMA busy_timeout").fetchone()[0], timeout)
            self.assertIsNone(db.execute("SELECT archived_at FROM material_request_batches WHERE id = ?", (batch_id,)).fetchone()[0])

    def test_read_maintenance_does_not_commit_or_rollback_caller_transaction(self):
        batch_id = self.pending_batch()
        with contextlib.closing(self.app.connect()) as db:
            db.execute("UPDATE material_request_batches SET comment = 'uncommitted caller' WHERE id = ?", (batch_id,))
            self.app.archive_material_batches_for_read(db)
            self.assertTrue(db.in_transaction)
            self.assertEqual(db.execute("SELECT comment FROM material_request_batches WHERE id = ?", (batch_id,)).fetchone()[0], "uncommitted caller")
            db.rollback()
            self.assertNotEqual(db.execute("SELECT comment FROM material_request_batches WHERE id = ?", (batch_id,)).fetchone()[0], "uncommitted caller")

    def test_photo_and_document_uploads_allow_second_http_write_during_transfer(self):
        for kind in ["photo", "project", "knowledge_base"]:
            with self.subTest(kind=kind):
                marker = "Anna documents " + str(uuid4())
                if kind == "photo":
                    route = "/api/photo-reports"
                    payload = {"project_id": 1, "comment": marker, "report_date": "2026-09-10", "attachments": [
                        file_payload("one.png", PNG, "image/png"), file_payload("two.png", PNG + b"two", "image/png")],
                    }
                else:
                    route = "/api/documents"
                    payload = {"project_id": 1, "related_type": kind, "title": marker, "documents": [
                        {"document_file": file_payload("one.pdf", PDF, "application/pdf"), "relative_path": marker + "/Nested/one.pdf"},
                        {"document_file": file_payload("two.pdf", PDF + b"two", "application/pdf"), "relative_path": marker.lower() + "/nested/two.pdf"}],
                    }
                with contextlib.closing(self.app.connect()) as db:
                    before = db.execute("SELECT count(*) FROM documents").fetchone()[0]
                result = []
                with self.loopback_storage(pause_second=True) as (transactions, entered, release):
                    thread = threading.Thread(target=lambda: result.append(self.request("POST", route, payload)))
                    thread.start()
                    try:
                        self.assertTrue(entered.wait(10))
                        self.assertEqual(self.request("GET", "/api/documents")[0], 200)
                        second_payload = self.job_payload()
                        second_payload["attachments"] = []
                        status, _, body = self.request("POST", "/api/estimate-jobs", second_payload)
                        self.assertEqual(status, 201, body)
                        with contextlib.closing(self.app.connect()) as db:
                            self.assertEqual(db.execute("SELECT count(*) FROM documents").fetchone()[0], before)
                    finally:
                        release.set()
                        thread.join(20)
                    self.assertFalse(thread.is_alive())
                    self.assertEqual(transactions, [False, False])
                    status, _, body = result[0]
                    self.assertEqual(status, 201, body)
                    ids = json.loads(body)["documents" if kind == "photo" else "ids"]
                    self.assertEqual(len(ids), 2)
                    for file_id, expected in zip(ids, [PNG, PNG + b"two"] if kind == "photo" else [PDF, PDF + b"two"]):
                        self.assertEqual(self.request("GET", f"/api/documents/{file_id}/download")[2], expected)
                    if kind == "knowledge_base":
                        _, _, body = self.request("GET", "/api/documents?related_type=knowledge_base")
                        files = [item for item in json.loads(body) if item["id"] in ids]
                        self.assertEqual({item["folder_path"] for item in files}, {marker + "/Nested"})
                        self.assertTrue(all(marker + "/Nested/" in item["file_path"] for item in files))

    def test_photo_rechecks_project_access_and_task_after_transfer(self):
        for change in ["project_access", "deleted_task"]:
            with self.subTest(change=change):
                payload = {"project_id": 1, "comment": str(uuid4()), "attachments": [
                    file_payload("one.png", PNG, "image/png"), file_payload("two.png", PNG, "image/png")],
                }
                with contextlib.closing(self.app.connect()) as db, db:
                    original_foreman = db.execute("SELECT foreman_id FROM projects WHERE id = 1").fetchone()[0]
                    db.execute("UPDATE projects SET foreman_id = 7 WHERE id = 1")
                    if change == "deleted_task":
                        payload["task_id"] = db.execute("INSERT INTO tasks (project_id, title, assignee_id, status) VALUES (1, 'Anna deleted task', 1, 'in_progress')").lastrowid
                results = []
                try:
                    with self.loopback_storage(pause_second=True) as (transactions, entered, release):
                        thread = threading.Thread(target=lambda: results.append(self.request("POST", "/api/photo-reports", payload, user="foreman")))
                        thread.start()
                        try:
                            self.assertTrue(entered.wait(10))
                            with contextlib.closing(self.app.connect()) as db, db:
                                if change == "project_access":
                                    db.execute("UPDATE projects SET foreman_id = 1 WHERE id = 1")
                                else:
                                    db.execute("DELETE FROM tasks WHERE id = ?", (payload["task_id"],))
                        finally:
                            release.set()
                            thread.join(20)
                        self.assertFalse(thread.is_alive())
                        self.assertEqual(transactions, [False, False])
                        self.assertEqual(results[0][0], 404 if change == "project_access" else 400, results)
                        self.assertEqual(len(self.loopback_objects), 0)
                    with contextlib.closing(self.app.connect()) as db:
                        self.assertEqual(db.execute("SELECT count(*) FROM photo_reports WHERE comment = ?", (payload["comment"],)).fetchone()[0], 0)
                finally:
                    with contextlib.closing(self.app.connect()) as db, db:
                        db.execute("UPDATE projects SET foreman_id = ? WHERE id = 1", (original_foreman,))

    def test_concurrent_photo_resubmission_creates_one_report_with_and_without_task(self):
        for with_task in [False, True]:
            with self.subTest(with_task=with_task):
                payload = {"project_id": 1, "comment": str(uuid4()), "report_date": "2026-09-10", "attachments": [file_payload("photo.png", PNG, "image/png")]}
                if with_task:
                    with contextlib.closing(self.app.connect()) as db, db:
                        payload["task_id"] = db.execute("INSERT INTO tasks (project_id, title, assignee_id, status) VALUES (1, 'Anna duplicate task', 1, 'in_progress')").lastrowid
                barrier = threading.Barrier(2)
                with self.loopback_storage() as (transactions, _, _):
                    original_save = self.app.save_uploaded_file

                    def synchronized_save(db, *args, **kwargs):
                        result = original_save(db, *args, **kwargs)
                        barrier.wait(8)
                        return result

                    with patch.object(self.app, "save_uploaded_file", synchronized_save), ThreadPoolExecutor(max_workers=2) as pool:
                        results = list(pool.map(lambda _: self.request("POST", "/api/photo-reports", payload, timeout=20), range(2)))
                    self.assertEqual(transactions, [False, False])
                    self.assertEqual(len(self.loopback_objects), 1, "The duplicate request must discard only its own prepared bytes")
                self.assertEqual(sorted(result[0] for result in results), [200, 201], results)
                ids = {json.loads(result[2])["id"] for result in results}
                self.assertEqual(len(ids), 1)
                with contextlib.closing(self.app.connect()) as db:
                    count = db.execute("SELECT count(*) FROM photo_reports WHERE comment = ?", (payload["comment"],)).fetchone()[0]
                    attachments = db.execute("SELECT count(*) FROM photo_report_documents WHERE photo_report_id = ?", (next(iter(ids)),)).fetchone()[0]
                    self.assertEqual((count, attachments), (1, 1))
                    if with_task:
                        self.assertEqual(db.execute("SELECT status FROM tasks WHERE id = ?", (payload["task_id"],)).fetchone()[0], "waiting_check")

    def test_document_preparation_preserves_local_kb_paths_and_metadata_only_posts(self):
        marker = "Anna folder " + str(uuid4())
        status, _, body = self.request("POST", "/api/document-folders", {"title": marker})
        self.assertEqual(status, 201, body)
        folder_id = json.loads(body)["id"]
        status, _, body = self.request("POST", "/api/documents", {
            "related_type": "knowledge_base", "folder_id": folder_id,
            "documents": [
                {"relative_path": "Nested/one.pdf", "document_file": file_payload("one.pdf", PDF, "application/pdf")},
                {"relative_path": "nested/two.png", "document_file": file_payload("two.png", PNG, "image/png")},
            ],
        })
        self.assertEqual(status, 201, body)
        ids = json.loads(body)["ids"]
        with contextlib.closing(self.app.connect()) as db:
            for file_id, expected in zip(ids, [PDF, PNG]):
                file = db.execute("SELECT * FROM documents WHERE id = ?", (file_id,)).fetchone()
                path = self.data_dir / file["file_path"]
                self.assertEqual(path.parent, self.app.UPLOAD_DIR / f"project_{file['project_id']}" / marker / "Nested")
                self.assertEqual(path.read_bytes(), expected)
        status, _, body = self.request("POST", "/api/documents", {"related_type": "knowledge_base", "folder_id": folder_id, "title": "Anna metadata only"})
        self.assertEqual(status, 201, body)
        self.assertEqual(self.request("GET", f"/api/documents/{json.loads(body)['id']}/download")[0], 404)

    def test_photo_and_kb_failures_rollback_all_metadata(self):
        tables = ["documents", "photo_reports", "photo_report_documents", "knowledge_folders", "projects", "events", "notifications"]
        cases = [
            ("/api/photo-reports", {"project_id": 1, "author_id": 999999, "comment": str(uuid4()), "attachments": [file_payload("photo.png", PNG, "image/png")]}),
            ("/api/documents", {"related_type": "knowledge_base", "documents": [
                {"relative_path": str(uuid4()) + "/one.pdf", "document_file": file_payload("one.pdf", PDF, "application/pdf")},
                {"owner_id": 999999, "relative_path": str(uuid4()) + "/two.pdf", "document_file": file_payload("two.pdf", PDF, "application/pdf")},
            ]}),
        ]
        for route, payload in cases:
            with self.subTest(route=route):
                with contextlib.closing(self.app.connect()) as db:
                    before = [db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in tables]
                status, _, body = self.request("POST", route, payload)
                self.assertEqual(status, 400, body)
                with contextlib.closing(self.app.connect()) as db:
                    after = [db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in tables]
                self.assertEqual(after, before)

    def test_document_and_photo_permissions_are_checked_before_transfer(self):
        with self.loopback_storage() as (transactions, _, _):
            status, _, body = self.request("POST", "/api/documents", {"related_type": "knowledge_base", "document_file": file_payload("plan.pdf", PDF, "application/pdf")}, user="foreman")
            self.assertEqual(status, 403, body)
            with patch.dict(os.environ, {"APP_ACCESS_ACCOUNTS": os.environ["APP_ACCESS_ACCOUNTS"] + ";estimator|synthetic|5|estimator|0"}):
                status, _, body = self.request("POST", "/api/photo-reports", {"project_id": 1, "attachments": [file_payload("photo.png", PNG, "image/png")]}, user="estimator")
                self.assertEqual(status, 403, body)
            self.assertEqual(transactions, [])


if __name__ == "__main__":
    unittest.main()

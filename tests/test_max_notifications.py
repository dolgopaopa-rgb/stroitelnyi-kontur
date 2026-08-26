import os
import sys
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

import server


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b"{}"


class ImmediateThread:
    def __init__(self, target, daemon=False):
        self.target = target
        self.daemon = daemon

    def start(self):
        self.target()


class MaxNotificationTests(unittest.TestCase):
    def setUp(self):
        self.previous_token = os.environ.get("MAX_TOKEN")
        self.previous_api_url = server.MAX_API_URL
        os.environ["MAX_TOKEN"] = "test-token"
        server.MAX_API_URL = "https://platform-api2.max.ru"

    def tearDown(self):
        server.MAX_API_URL = self.previous_api_url
        if self.previous_token is None:
            os.environ.pop("MAX_TOKEN", None)
        else:
            os.environ["MAX_TOKEN"] = self.previous_token

    def test_personal_message_uses_user_id(self):
        requests = []

        def fake_urlopen(request, timeout):
            requests.append((request, timeout))
            return FakeResponse()

        with patch.object(server, "urlopen", side_effect=fake_urlopen):
            ok, error = server.send_max_message("12345", "Личное уведомление", recipient_type="user")

        self.assertTrue(ok)
        self.assertEqual(error, "")
        query = parse_qs(urlparse(requests[0][0].full_url).query)
        self.assertEqual(query, {"user_id": ["12345"]})

    def test_group_report_keeps_chat_id(self):
        requests = []

        def fake_urlopen(request, timeout):
            requests.append((request, timeout))
            return FakeResponse()

        with patch.object(server, "urlopen", side_effect=fake_urlopen):
            ok, error = server.send_max_message("-74707261482336", "Отчёт для коллег")

        self.assertTrue(ok)
        self.assertEqual(error, "")
        query = parse_qs(urlparse(requests[0][0].full_url).query)
        self.assertEqual(query, {"chat_id": ["-74707261482336"]})

    def test_old_api_host_is_normalized(self):
        self.assertEqual(
            server.normalized_max_api_url("https://platform-api.max.ru/"),
            "https://platform-api2.max.ru",
        )

    def test_notification_queue_sends_personal_message(self):
        sent = []
        statuses = []

        def fake_send(recipient_id, text, *, recipient_type="chat"):
            sent.append((recipient_id, text, recipient_type))
            return True, ""

        with (
            patch.object(server, "send_max_message", side_effect=fake_send),
            patch.object(server, "update_notification_max_status", side_effect=lambda *args: statuses.append(args)),
            patch.object(server.threading, "Thread", ImmediateThread),
            patch.object(server.time, "sleep", return_value=None),
        ):
            server.enqueue_max_notification(
                notification_id=42,
                recipient_id="12345",
                project_id=7,
                title="Новое задание",
                text="Откройте Контур",
                related_type="task",
                related_id=9,
            )

        self.assertEqual(sent[0][0], "12345")
        self.assertEqual(sent[0][2], "user")
        self.assertEqual(statuses, [(42, "sent", "")])


if __name__ == "__main__":
    unittest.main()

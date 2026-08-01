import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]


class AppealsRouteSafetyTests(unittest.TestCase):
    def test_disabled_appeals_route_returns_controlled_utf8_404(self):
        with tempfile.TemporaryDirectory() as directory:
            port = 8877
            env = os.environ.copy()
            env.update(
                {
                    "APP_DATA_DIR": directory,
                    "APPEALS_ENABLED": "",
                    "APPEALS_TEST_MODE": "",
                    "HOST": "127.0.0.1",
                    "PORT": str(port),
                    "PYTHONIOENCODING": "utf-8",
                }
            )
            process = subprocess.Popen(
                [sys.executable, "app/server.py"],
                cwd=ROOT,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                response = None
                for _ in range(30):
                    try:
                        response = urlopen(f"http://127.0.0.1:{port}/appeals", timeout=1)
                        break
                    except HTTPError as exc:
                        response = exc
                        break
                    except OSError:
                        time.sleep(0.1)
                self.assertIsNotNone(response, "Сервер не запустился в течение 3 секунд")
                self.assertEqual(response.status, 404)
                body = response.read().decode("utf-8")
                self.assertNotIn("Traceback", body)
                self.assertNotIn("UnicodeEncodeError", body)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


if __name__ == "__main__":
    unittest.main()

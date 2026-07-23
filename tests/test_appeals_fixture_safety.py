import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "seed-appeals-fixtures.py"
APP_DIR = ROOT / "app"
STANDARD_DB = APP_DIR / "construction.db"


class AppealsFixtureSafetyTests(unittest.TestCase):
    def run_seed(self, *, data_dir: Path | None = None, test_mode: str | None = "1") -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["APPEALS_ENABLED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        if test_mode is None:
            env.pop("APPEALS_TEST_MODE", None)
        else:
            env["APPEALS_TEST_MODE"] = test_mode
        if data_dir is None:
            env.pop("APP_DATA_DIR", None)
        else:
            env["APP_DATA_DIR"] = str(data_dir)
        return subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    def test_missing_data_dir_fails_without_touching_standard_database(self):
        before = STANDARD_DB.read_bytes() if STANDARD_DB.exists() else None
        result = self.run_seed(data_dir=None)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("APP_DATA_DIR", result.stderr)
        after = STANDARD_DB.read_bytes() if STANDARD_DB.exists() else None
        self.assertEqual(after, before)

    def test_missing_test_mode_fails_without_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            result = self.run_seed(data_dir=data_dir, test_mode=None)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((data_dir / "construction.db").exists())
            self.assertFalse((data_dir / ".d2dom-appeals-test").exists())

    def test_standard_app_directory_is_rejected(self):
        result = self.run_seed(data_dir=APP_DIR)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(STANDARD_DB.exists())

    def test_database_file_path_is_rejected(self):
        result = self.run_seed(data_dir=STANDARD_DB)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(STANDARD_DB.exists())

    def test_non_empty_directory_without_marker_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            (data_dir / "unexpected.txt").write_text("not a test database", encoding="utf-8")
            result = self.run_seed(data_dir=data_dir)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((data_dir / "construction.db").exists())
            self.assertTrue((data_dir / "unexpected.txt").exists())

    def test_empty_directory_is_marked_and_seeded_without_uncontrolled_duplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            first = self.run_seed(data_dir=data_dir)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertIn(f"APP_DATA_DIR={data_dir.resolve()}", first.stdout)
            self.assertIn("DB_PATH=", first.stdout)
            self.assertIn("synthetic_appeals=13", first.stdout)
            self.assertTrue((data_dir / ".d2dom-appeals-test").exists())
            db_path = data_dir / "construction.db"
            db = sqlite3.connect(db_path)
            try:
                first_count = db.execute("SELECT COUNT(*) FROM appeals").fetchone()[0]
            finally:
                db.close()
            second = self.run_seed(data_dir=data_dir)
            self.assertEqual(second.returncode, 0, second.stderr)
            db = sqlite3.connect(db_path)
            try:
                second_count = db.execute("SELECT COUNT(*) FROM appeals").fetchone()[0]
            finally:
                db.close()
            self.assertEqual(first_count, 13)
            self.assertEqual(second_count, first_count)


if __name__ == "__main__":
    unittest.main()

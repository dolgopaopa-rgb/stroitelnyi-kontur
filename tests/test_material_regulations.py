from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMPORT_SCRIPT = ROOT / "tools" / "import_material_regulations.py"


class MaterialRegulationImportTests(unittest.TestCase):
    def test_import_is_idempotent_and_marks_regulations_active(self) -> None:
        with tempfile.TemporaryDirectory(prefix="kontur-material-regulations-") as temp_dir:
            env = {**os.environ, "APP_DATA_DIR": temp_dir, "PYTHONDONTWRITEBYTECODE": "1"}
            command = [sys.executable, str(IMPORT_SCRIPT), "--data-dir", temp_dir]
            first = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, check=False)
            second = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, check=False)
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)

            with closing(sqlite3.connect(Path(temp_dir) / "construction.db")) as db:
                db.row_factory = sqlite3.Row
                rows = db.execute(
                    """
                    SELECT title, type, version, status, file_path
                    FROM documents
                    WHERE related_type = 'knowledge_base'
                      AND process_type = 'material_regulation'
                    ORDER BY title
                    """
                ).fetchall()
            self.assertEqual(len(rows), 3)
            self.assertEqual({row["version"] for row in rows}, {"Действующая"})
            self.assertEqual({row["status"] for row in rows}, {"active"})
            self.assertEqual({row["type"] for row in rows}, {"regulation", "instruction"})
            for row in rows:
                self.assertTrue((Path(temp_dir) / row["file_path"]).is_file())


if __name__ == "__main__":
    unittest.main()

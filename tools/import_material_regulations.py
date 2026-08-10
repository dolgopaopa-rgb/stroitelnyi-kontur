from __future__ import annotations

import argparse
import mimetypes
import os
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "app" / "knowledge-base" / "Строительство" / "Снабжение и материалы" / "Регламенты"
FOLDER_PATH = ("Строительство", "Снабжение и материалы", "Регламенты")
DOCUMENTS = (
    ("Регламент оформления заявки на материал.pdf", "Регламент оформления заявки на материал", "regulation"),
    ("Регламент разнесения закупок.pdf", "Регламент разнесения закупок", "regulation"),
    ("Краткая инструкция по заявкам и закупкам.md", "Краткая инструкция по заявкам и закупкам", "instruction"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Idempotently publish active material regulations to the Contour knowledge base.")
    parser.add_argument("--data-dir", required=True, help="Isolated or deployed APP_DATA_DIR.")
    parser.add_argument("--dry-run", action="store_true", help="Validate bundled files without changing the database or storage.")
    return parser.parse_args()


def ensure_folder(db, title: str, parent_id: int | None, owner_id: int) -> int:
    row = db.execute(
        "SELECT id FROM knowledge_folders WHERE title = ? AND parent_id IS ? ORDER BY id LIMIT 1",
        (title, parent_id),
    ).fetchone()
    if row:
        return int(row["id"])
    cursor = db.execute(
        "INSERT INTO knowledge_folders (parent_id, title, created_by) VALUES (?, ?, ?)",
        (parent_id, title, owner_id),
    )
    return int(cursor.lastrowid)


def main() -> int:
    args = parse_args()
    data_dir = Path(args.data_dir).resolve()
    missing = [name for name, _, _ in DOCUMENTS if not (SOURCE_DIR / name).is_file()]
    if missing:
        raise SystemExit("Missing bundled regulation files: " + ", ".join(missing))
    if args.dry_run:
        print(f"OK: {len(DOCUMENTS)} files are ready for {data_dir}")
        return 0

    os.environ["APP_DATA_DIR"] = str(data_dir)
    sys.path.insert(0, str(ROOT / "app"))
    from database import connect, init_db  # pylint: disable=import-outside-toplevel

    init_db()
    target_dir = data_dir / "uploads" / "knowledge-base" / "material-regulations"
    target_dir.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        owner = db.execute("SELECT id FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY id LIMIT 1").fetchone()
        project = db.execute("SELECT id FROM projects ORDER BY CASE WHEN status = 'archived' THEN 1 ELSE 0 END, id LIMIT 1").fetchone()
        if not owner or not project:
            raise RuntimeError("Owner and at least one project are required to publish knowledge-base documents.")
        owner_id = int(owner["id"])
        parent_id = None
        for title in FOLDER_PATH:
            parent_id = ensure_folder(db, title, parent_id, owner_id)
        for file_name, title, document_type in DOCUMENTS:
            source = SOURCE_DIR / file_name
            target = target_dir / file_name
            shutil.copy2(source, target)
            relative_path = str(target.relative_to(data_dir))
            mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            existing = db.execute(
                """
                SELECT id FROM documents
                WHERE related_type = 'knowledge_base'
                  AND process_type = 'material_regulation'
                  AND file_name = ?
                ORDER BY id LIMIT 1
                """,
                (file_name,),
            ).fetchone()
            values = (
                int(project["id"]),
                parent_id,
                title,
                document_type,
                owner_id,
                file_name,
                relative_path,
                mime_type,
                int(target.stat().st_size),
            )
            if existing:
                db.execute(
                    """
                    UPDATE documents
                    SET project_id = ?, folder_id = ?, title = ?, type = ?, version = 'Действующая',
                        status = 'active', owner_id = ?, related_type = 'knowledge_base',
                        related_section = 'materials', process_type = 'material_regulation',
                        file_name = ?, file_path = ?, mime_type = ?, file_size = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (*values, int(existing["id"])),
                )
            else:
                db.execute(
                    """
                    INSERT INTO documents (
                        project_id, folder_id, title, type, version, status, owner_id,
                        related_type, related_section, process_type, file_name, file_path,
                        mime_type, file_size
                    )
                    VALUES (?, ?, ?, ?, 'Действующая', 'active', ?, 'knowledge_base',
                            'materials', 'material_regulation', ?, ?, ?, ?)
                    """,
                    values,
                )
        db.commit()
    print(f"OK: active regulations published to {' / '.join(FOLDER_PATH)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

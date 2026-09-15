"""Isolated QA entrypoint: fresh owned data, no outgoing sockets or child processes."""
import os
from pathlib import Path
import runpy
import sys
from uuid import uuid4

repo = Path(__file__).resolve().parents[2]
owned = (repo / ".tmp" / "object-card-20260915").resolve()
owned.mkdir(parents=True, exist_ok=True)
data = Path(os.environ["APP_DATA_DIR"]).resolve()
if data != owned / "data" or data.parent != owned:
    raise RuntimeError("Data directory must remain inside this QA workspace")
if os.environ.get("HOST") != "127.0.0.1" or os.environ.get("PORT") != "8915":
    raise RuntimeError("Only loopback port 8915 is allowed")
# Preserve any previous run, without deleting data or reusing its database.
if data.exists():
    archive = (owned / ("data-previous-" + uuid4().hex)).resolve()
    if archive.parent != owned:
        raise RuntimeError("Invalid archive target")
    data.rename(archive)
data.mkdir()

def guard(event, args):
    if event in {"socket.connect", "socket.connect_ex", "socket.sendto",
                 "subprocess.Popen", "os.system"}:
        raise RuntimeError("External calls and child processes are forbidden in QA")

sys.addaudithook(guard)
sys.path.insert(0, str(repo / "app"))
runpy.run_path(str(repo / "app" / "server.py"), run_name="__main__")

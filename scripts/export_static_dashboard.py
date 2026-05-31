from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import build_dashboard_payload


DIST = ROOT / "dist"
DATA_DIR = DIST / "data"

STATIC_FILES = [
    "index.html",
    "styles.css",
    "app.js",
    "config.js",
    "services.js",
]


def main():
    if DIST.exists():
        shutil.rmtree(DIST)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for file_name in STATIC_FILES:
        shutil.copy2(ROOT / file_name, DIST / file_name)

    payload = build_dashboard_payload()
    with (DATA_DIR / "dashboard.json").open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")

    (DIST / ".nojekyll").write_text("", encoding="utf-8")


if __name__ == "__main__":
    main()

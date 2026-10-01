from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.preflight import run_preflight


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--no-port-check", action="store_true")
    args = parser.parse_args()
    result = run_preflight(
        ROOT,
        ROOT / "data",
        check_port=not args.no_port_check,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print()
        print("PDF English Reviewer Preflight Check")
        print()
        for check in result["checks"]:
            marker = "OK" if check["ready"] else ("WARNING" if check["status"] == "warning" else "BLOCKED")
            print(f"[{marker}] {check['label']}: {check['detail']}")
            if not check["ready"] and check["fix"]:
                print(f"          Fix: {check['fix']}")
        print()
        if result["full_review_ready"]:
            print("Full Review is ready.")
        else:
            print("Full Review is unavailable. Basic Viewer remains available.")
    if result["reviewer_running"]:
        return 4
    if result["full_review_ready"]:
        return 0
    return 2 if result["basic_viewer_ready"] else 3


if __name__ == "__main__":
    raise SystemExit(main())

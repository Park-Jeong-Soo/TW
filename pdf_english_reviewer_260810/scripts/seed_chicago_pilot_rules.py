from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.rules.chicago_pilot import (  # noqa: E402
    BATCH1_RULE_KEYS,
    BATCH2_RULE_KEYS,
    CHICAGO_PILOT_RULES_BATCH2_PATH,
    CHICAGO_PILOT_RULES_PATH,
    HIGH_CONFIDENCE_ALL_CHICAGO_RULE_KEYS,
    HIGH_CONFIDENCE_CHICAGO_BATCH2_RULE_KEYS,
    HIGH_CONFIDENCE_CHICAGO_RULE_KEYS,
    TEAM_STANDARD_MATCHERS,
)

REQUIRED_COLUMNS = {
    "rule_key",
    "title",
    "description",
    "category",
    "matcher_type",
    "pattern",
    "replacement",
    "message",
    "severity",
    "scope",
    "enabled",
    "approval_status",
    "source_type",
    "source_path",
    "legacy_rule_id",
    "version",
    "created_at",
    "updated_at",
    "draft_json",
}

ORIGINAL_RULE_KEYS = {
    "UNIT_SPACE_001",
    "STYLE_EG_IE_COMMA_001",
    "TM_CAUTION_LABEL_001",
}
BLOCKED_DISPLAY_NAMES = {
    "space between number and unit",
    "comma after e.g. and i.e.",
    "use uppercase caution labels",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def selected_seed_paths(batch: str) -> list[Path]:
    if batch == "1":
        return [CHICAGO_PILOT_RULES_PATH]
    if batch == "2":
        return [CHICAGO_PILOT_RULES_BATCH2_PATH]
    return [CHICAGO_PILOT_RULES_PATH, CHICAGO_PILOT_RULES_BATCH2_PATH]


def load_rule_seed(path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        raise ValueError(f"Chicago pilot seed must contain a rules list: {path}")
    expected = 20
    if len(rules) != expected:
        raise ValueError(f"{path.name} must contain exactly {expected} rules; found {len(rules)}.")
    keys = [str(item.get("rule_key") or "") for item in rules]
    if len(set(keys)) != len(keys):
        raise ValueError(f"{path.name} contains duplicate rule_key values.")
    missing_matchers = [key for key in keys if key not in TEAM_STANDARD_MATCHERS]
    if missing_matchers:
        raise ValueError(f"Missing matcher registrations: {', '.join(missing_matchers)}")
    return payload


def load_selected_payloads(batch: str) -> list[dict[str, Any]]:
    payloads = [load_rule_seed(path) for path in selected_seed_paths(batch)]
    all_keys = [str(rule.get("rule_key") or "") for payload in payloads for rule in payload["rules"]]
    if len(set(all_keys)) != len(all_keys):
        raise ValueError("Selected Chicago pilot seeds contain duplicate rule_key values.")
    if batch in {"2", "all"} and set(rule["rule_key"] for payload in payloads for rule in payload["rules"] if rule.get("pilot_batch") == 2) != BATCH2_RULE_KEYS:
        raise ValueError("Batch 2 seed key inventory does not match the matcher inventory.")
    if batch in {"1", "all"} and set(rule["rule_key"] for payload in payloads for rule in payload["rules"] if rule.get("pilot_batch") == 1) != BATCH1_RULE_KEYS:
        raise ValueError("Batch 1 seed key inventory does not match the matcher inventory.")
    return payloads


def schema_columns(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    rows = conn.execute("PRAGMA table_info(team_manual_standard_rules)").fetchall()
    return {str(row[1]): {"name": row[1], "type": row[2], "notnull": row[3], "default": row[4], "pk": row[5]} for row in rows}


def validate_schema(conn: sqlite3.Connection) -> dict[str, Any]:
    columns = schema_columns(conn)
    missing = sorted(REQUIRED_COLUMNS - set(columns))
    indexes = conn.execute("PRAGMA index_list(team_manual_standard_rules)").fetchall()
    return {
        "columns": columns,
        "missing_required_columns": missing,
        "indexes": [tuple(row) for row in indexes],
        "valid": not missing,
    }


def current_rule_inventory(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    return [
        {
            "rule_key": row["rule_key"],
            "display_name": row["title"],
            "source_section": row["source_path"],
            "enabled": bool(row["enabled"]),
            "matcher_type": row["matcher_type"],
            "matcher_linked": str(row["rule_key"] or "") in TEAM_STANDARD_MATCHERS,
            "matcher_pending": str(row["pattern"] or "").startswith("__chicago_pilot__:") and str(row["rule_key"] or "") not in TEAM_STANDARD_MATCHERS,
            "source_type": row["source_type"],
        }
        for row in conn.execute(
            """
            SELECT rule_key, title, source_path, enabled, matcher_type, pattern, source_type
            FROM team_manual_standard_rules
            ORDER BY rule_key
            """
        ).fetchall()
    ]


def draft_json_for_rule(seed_rule: dict[str, Any], payload: dict[str, Any]) -> str:
    metadata_keys = {
        "pilot_batch",
        "source_section",
        "source_note",
        "source_status",
        "source_role",
        "positive_examples",
        "negative_examples",
        "exception_examples",
        "exceptions",
        "matcher_config",
        "matcher_status",
        "pilot_risk",
    }
    data = {key: seed_rule[key] for key in metadata_keys if key in seed_rule}
    data["source_standard"] = seed_rule.get("source_standard") or payload.get("source_standard", "Chicago Manual of Style")
    data["source_edition"] = str(seed_rule.get("source_edition") or payload.get("source_edition", "18"))
    data["seed_version"] = payload.get("version", 1)
    return json.dumps(data, ensure_ascii=False, sort_keys=True)


def enabled_for_rule(rule_key: str, seed_rule: dict[str, Any], *, batch: str, enable_high_confidence: bool) -> bool:
    if not enable_high_confidence:
        return False
    high_confidence = HIGH_CONFIDENCE_ALL_CHICAGO_RULE_KEYS
    if batch == "1":
        high_confidence = HIGH_CONFIDENCE_CHICAGO_RULE_KEYS
    elif batch == "2":
        high_confidence = HIGH_CONFIDENCE_CHICAGO_BATCH2_RULE_KEYS
    return (
        rule_key in high_confidence
        and str(seed_rule.get("source_status") or "").endswith("_verified")
        and str(seed_rule.get("matcher_status") or "") == "implemented"
        and str(seed_rule.get("pilot_risk") or "") == "low"
    )


def record_for_rule(seed_rule: dict[str, Any], payload: dict[str, Any], *, batch: str, enable_high_confidence: bool, now: str) -> dict[str, Any]:
    rule_key = str(seed_rule["rule_key"])
    enabled = enabled_for_rule(rule_key, seed_rule, batch=batch, enable_high_confidence=enable_high_confidence)
    approval_status = "approved" if enabled else "candidate"
    source_section = str(seed_rule.get("source_section") or "").strip()
    source_label = "Chicago Manual of Style, 18th ed."
    if source_section:
        source_label = f"{source_label}, {source_section}"
    return {
        "rule_key": rule_key,
        "title": str(seed_rule.get("display_name") or rule_key),
        "description": str(seed_rule.get("description") or ""),
        "category": str(seed_rule.get("category") or "consistency"),
        "matcher_type": str(seed_rule.get("matcher_type") or "regex"),
        "pattern": f"__chicago_pilot__:{rule_key}",
        "replacement": str(seed_rule.get("suggestion") or ""),
        "message": str(seed_rule.get("message") or seed_rule.get("display_name") or rule_key),
        "severity": str(seed_rule.get("severity") or "suggestion"),
        "scope": "team",
        "enabled": 1 if enabled else 0,
        "approval_status": approval_status,
        "source_type": "chicago_pilot",
        "source_path": source_label,
        "legacy_rule_id": "",
        "version": 1,
        "created_by": "seed_chicago_pilot_rules.py",
        "reviewed_by": "",
        "origin_type": f"style_standard_pilot_batch_{seed_rule.get('pilot_batch', '')}",
        "origin_engine": "",
        "origin_issue_id": "",
        "origin_review_session_id": "",
        "candidate_note": f"Chicago Manual of Style 18th edition Team Manual Standard pilot batch {seed_rule.get('pilot_batch', '')}.",
        "draft_json": draft_json_for_rule(seed_rule, payload),
        "created_at": now,
        "updated_at": now,
    }


UPSERT_COLUMNS = [
    "rule_key",
    "title",
    "description",
    "category",
    "matcher_type",
    "pattern",
    "replacement",
    "message",
    "severity",
    "scope",
    "enabled",
    "approval_status",
    "source_type",
    "source_path",
    "legacy_rule_id",
    "created_by",
    "reviewed_by",
    "origin_type",
    "origin_engine",
    "origin_issue_id",
    "origin_review_session_id",
    "candidate_note",
    "draft_json",
]


def planned_changes(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    changes: list[dict[str, Any]] = []
    for record in records:
        row = conn.execute("SELECT * FROM team_manual_standard_rules WHERE rule_key = ?", (record["rule_key"],)).fetchone()
        if row is None:
            changes.append({"rule_key": record["rule_key"], "action": "insert", "changed_fields": sorted(UPSERT_COLUMNS)})
            continue
        changed = [column for column in UPSERT_COLUMNS if str(row[column]) != str(record[column])]
        changes.append({"rule_key": record["rule_key"], "action": "update" if changed else "unchanged", "changed_fields": changed})
    return changes


def semantic_conflicts(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> list[dict[str, str]]:
    conn.row_factory = sqlite3.Row
    conflicts: list[dict[str, str]] = []
    existing = conn.execute("SELECT rule_key, title FROM team_manual_standard_rules").fetchall()
    existing_titles = {str(row["title"] or "").strip().casefold(): str(row["rule_key"] or "") for row in existing}
    existing_keys = {str(row["rule_key"] or "") for row in existing}
    for record in records:
        key = str(record["rule_key"])
        title = str(record["title"]).strip().casefold()
        if key in ORIGINAL_RULE_KEYS:
            conflicts.append({"rule_key": key, "reason": "matches original Team Manual Standard rule key"})
        if title in BLOCKED_DISPLAY_NAMES:
            conflicts.append({"rule_key": key, "reason": "display name duplicates an original Team Manual Standard rule"})
        if title in existing_titles and existing_titles[title] != key:
            conflicts.append({"rule_key": key, "reason": f"display name duplicates existing key {existing_titles[title]}"})
        if key in existing_keys:
            continue
    return conflicts


def create_backup(db_path: Path, *, batch: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    suffix = "batch2" if batch in {"2", "all"} else "pilot"
    backup_path = backup_dir / f"reviewer_before_chicago_{suffix}_{stamp}.db"
    shutil.copy2(db_path, backup_path)
    return backup_path


def audit(action: str, detail: str = "", status: str = "SUCCESS") -> None:
    configured_log = os.environ.get("CHICAGO_PILOT_AUDIT_LOG", "")
    log_path = Path(configured_log) if configured_log else ROOT / "data" / "logs" / "audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": utc_now(),
        "action": action,
        "document_id": "",
        "project": "",
        "status": status,
    }
    if detail:
        record["detail"] = detail[:240]
    with log_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def apply_records(conn: sqlite3.Connection, records: list[dict[str, Any]], now: str) -> None:
    insert_columns = UPSERT_COLUMNS + ["created_at", "updated_at"]
    insert_sql = f"""
        INSERT INTO team_manual_standard_rules ({", ".join(insert_columns)})
        VALUES ({", ".join("?" for _ in insert_columns)})
    """
    update_columns = [column for column in UPSERT_COLUMNS if column != "rule_key"]
    update_sql = f"""
        UPDATE team_manual_standard_rules
        SET {", ".join(f"{column} = ?" for column in update_columns)},
            version = version + 1,
            updated_at = ?
        WHERE rule_key = ?
    """
    for record in records:
        existing = conn.execute("SELECT * FROM team_manual_standard_rules WHERE rule_key = ?", (record["rule_key"],)).fetchone()
        if existing is None:
            conn.execute(insert_sql, [record[column] for column in insert_columns])
            continue
        changed = [column for column in UPSERT_COLUMNS if str(existing[column]) != str(record[column])]
        if changed:
            conn.execute(update_sql, [record[column] for column in update_columns] + [now, record["rule_key"]])


def write_report(result: dict[str, Any], *, batch: str) -> Path:
    report_dir = ROOT / "interim_reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = report_dir / f"chicago_pilot_batch_{batch}_seed_report_{stamp}.json"
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path


def build_records(payloads: list[dict[str, Any]], *, batch: str, enable_high_confidence: bool, now: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for payload in payloads:
        records.extend(
            record_for_rule(rule, payload, batch=batch, enable_high_confidence=enable_high_confidence, now=now)
            for rule in payload["rules"]
        )
    return records


def run(args: argparse.Namespace) -> dict[str, Any]:
    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = ROOT / db_path
    db_path = db_path.resolve()
    if not db_path.exists():
        raise FileNotFoundError(f"Reviewer DB does not exist: {db_path}")
    batch = str(args.batch or "all")
    payloads = load_selected_payloads(batch)
    now = utc_now()
    records = build_records(payloads, batch=batch, enable_high_confidence=bool(args.enable_high_confidence), now=now)
    before_hash = file_sha256(db_path)
    before_mtime_ns = db_path.stat().st_mtime_ns
    conn = sqlite3.connect(db_path)
    try:
        conn.row_factory = sqlite3.Row
        schema = validate_schema(conn)
        if not schema["valid"]:
            raise RuntimeError(f"Unsupported team_manual_standard_rules schema: missing {schema['missing_required_columns']}")
        before_keys = {str(row["rule_key"]) for row in conn.execute("SELECT rule_key FROM team_manual_standard_rules").fetchall()}
        inventory_before = current_rule_inventory(conn)
        changes = planned_changes(conn, records)
        conflicts = semantic_conflicts(conn, records)
        result: dict[str, Any] = {
            "mode": "apply" if args.apply else "preview",
            "batch": batch,
            "db": str(db_path),
            "db_hash_before": before_hash,
            "db_mtime_ns_before": before_mtime_ns,
            "schema": {
                "columns": list(schema["columns"].keys()),
                "key_column": "rule_key",
                "display_column": "title",
                "matcher_type_column": "matcher_type",
                "matcher_config_column": "draft_json",
                "unique_key": "rule_key",
            },
            "rule_count": len(records),
            "enabled_count": sum(1 for item in records if item["enabled"]),
            "disabled_count": sum(1 for item in records if not item["enabled"]),
            "changes": changes,
            "conflicts": conflicts,
            "inventory_before": inventory_before,
            "backup": "",
            "report": "",
        }
        if conflicts:
            result["status"] = "blocked_by_duplicate_semantics"
            if args.report:
                result["report"] = str(write_report(result, batch=batch))
            return result
        if args.preview:
            result["db_hash_after"] = file_sha256(db_path)
            result["db_mtime_ns_after"] = db_path.stat().st_mtime_ns
            if args.report:
                result["report"] = str(write_report(result, batch=batch))
            return result
        backup_path = create_backup(db_path, batch=batch)
        result["backup"] = str(backup_path)
        try:
            with conn:
                apply_records(conn, records, now)
        except Exception:
            audit("CHICAGO_PILOT_SEED", "transaction rolled back", "FAILED")
            raise
        after_keys = {str(row["rule_key"]) for row in conn.execute("SELECT rule_key FROM team_manual_standard_rules").fetchall()}
        added_keys = sorted(after_keys - before_keys)
        result["added_keys"] = added_keys
        result["after_key_count"] = len(after_keys)
        result["before_key_count"] = len(before_keys)
        result["inventory_after"] = current_rule_inventory(conn)
        result["db_hash_after"] = file_sha256(db_path)
        result["db_mtime_ns_after"] = db_path.stat().st_mtime_ns
        expected_new_count = 20 if batch in {"1", "2"} and not (set(record["rule_key"] for record in records) & before_keys) else len(set(record["rule_key"] for record in records) - before_keys)
        if len(added_keys) != expected_new_count:
            raise RuntimeError(f"Unexpected added key count: expected {expected_new_count}, got {len(added_keys)}")
        audit("CHICAGO_PILOT_SEED", f"batch={batch},rules={len(records)},enabled={result['enabled_count']},backup={backup_path.name}")
        if args.report:
            result["report"] = str(write_report(result, batch=batch))
        return result
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Chicago Manual of Style pilot rules into reviewer.db.")
    parser.add_argument("--batch", choices=["1", "2"], default="all", help="Process only one Chicago pilot batch.")
    parser.add_argument("--all", action="store_true", help="Process Batch 1 and Batch 2 together.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preview", action="store_true", help="Show planned DB changes without modifying the DB.")
    mode.add_argument("--apply", action="store_true", help="Back up the DB and apply idempotent UPSERTs.")
    parser.add_argument("--enable-high-confidence", action="store_true", help="Enable verified, implemented low-risk rules.")
    parser.add_argument("--report", action="store_true", help="Write a JSON report with before/after DB and matcher inventory.")
    parser.add_argument("--db", default="data/reviewer.db", help="Path to reviewer.db. Defaults to data/reviewer.db.")
    args = parser.parse_args()
    if args.all:
        args.batch = "all"
    return args


if __name__ == "__main__":
    print(json.dumps(run(parse_args()), ensure_ascii=False, indent=2))

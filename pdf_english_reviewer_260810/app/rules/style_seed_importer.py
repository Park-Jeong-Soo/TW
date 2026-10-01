from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - surfaced by preflight/tests
    yaml = None


STYLE_SEED_GLOB = "*_style_rules.yaml"
IGNORED_STYLE_SEED_FILES = {"rules.yaml", "style_profiles.yaml", "exceptions.yaml", "source_map.yaml"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def discover_style_seed_paths(team_standard_dir: Path) -> list[Path]:
    if not team_standard_dir.exists():
        return []
    return sorted(
        path
        for path in team_standard_dir.glob(STYLE_SEED_GLOB)
        if path.is_file() and path.name not in IGNORED_STYLE_SEED_FILES
    )


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


def _text(value: Any) -> str:
    return str(value or "").strip()


def _slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return slug.strip("_")


def _regex_with_flags(pattern: str, flags: str) -> str:
    normalized_flags = "".join(ch for ch in flags.lower() if ch in "aiLmsux")
    normalized_flags = normalized_flags.replace("l", "L")
    if not normalized_flags or pattern.startswith("(?"):
        return pattern
    return f"(?{normalized_flags}){pattern}"


def _record_for_pattern(
    *,
    rule: dict[str, Any],
    pattern: str,
    pattern_index: int,
    pattern_count: int,
    source_path: str,
    source_meta: dict[str, Any],
    now: str,
) -> dict[str, Any]:
    raw_id = _text(rule.get("id") or rule.get("rule_key"))
    title = _text(rule.get("title") or rule.get("name") or raw_id)
    base_key = _slug(raw_id or title)
    if not base_key:
        raise ValueError("Style seed rule is missing id/rule_key/title.")
    rule_key = base_key if pattern_count == 1 else f"{base_key}_{pattern_index}"
    detect = rule.get("detect") if isinstance(rule.get("detect"), dict) else {}
    flags = _text(detect.get("flags") or rule.get("flags"))
    examples = {
        "bad": _as_list(rule.get("bad_examples") or rule.get("positive_examples")),
        "good": _as_list(rule.get("good_examples") or rule.get("negative_examples")),
    }
    draft = {
        "seed_schema": "style_rules_v1",
        "source_meta": source_meta,
        "original_rule_id": raw_id,
        "original_rule": rule,
        "pattern_index": pattern_index,
        "pattern_count": pattern_count,
        "examples": examples,
    }
    description = _text(rule.get("description_en") or rule.get("description") or rule.get("description_ko"))
    suggestion = _text(rule.get("suggestion") or rule.get("fix_suggestion") or rule.get("replacement"))
    message = _text(rule.get("message") or rule.get("rationale") or description or title)
    return {
        "rule_key": rule_key,
        "title": title or rule_key,
        "description": description,
        "category": _text(rule.get("category")) or "consistency",
        "matcher_type": "regex",
        "pattern": _regex_with_flags(pattern, flags),
        "replacement": suggestion,
        "message": message,
        "severity": _text(rule.get("severity")) or "warning",
        "scope": "team",
        "enabled": 0,
        "approval_status": "candidate",
        "source_type": "style_seed_yaml",
        "source_path": source_path,
        "legacy_rule_id": raw_id,
        "created_by": "style_seed_importer",
        "reviewed_by": "",
        "origin_type": "style_seed_yaml",
        "origin_engine": "",
        "origin_issue_id": "",
        "origin_review_session_id": "",
        "candidate_note": "Imported from a team style YAML seed. Review, validate, then approve and enable.",
        "draft_json": json.dumps(draft, ensure_ascii=False, sort_keys=True),
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }


def records_from_style_seed(path: Path, *, display_source_path: str | None = None) -> list[dict[str, Any]]:
    if yaml is None:
        raise RuntimeError("PyYAML is required to load team style seed rules.")
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rules = payload.get("rules") or []
    if not isinstance(rules, list):
        raise ValueError(f"Style seed must contain a rules list: {path}")
    source_meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    source_path = display_source_path or str(path)
    now = utc_now()
    records: list[dict[str, Any]] = []
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        detect = rule.get("detect") if isinstance(rule.get("detect"), dict) else {}
        matcher_type = _text(detect.get("type") or rule.get("matcher_type") or "regex").casefold()
        if matcher_type != "regex":
            continue
        patterns = [_text(item) for item in _as_list(detect.get("patterns") or detect.get("pattern") or rule.get("patterns"))]
        patterns = [item for item in patterns if item]
        for index, pattern in enumerate(patterns, start=1):
            records.append(
                _record_for_pattern(
                    rule=rule,
                    pattern=pattern,
                    pattern_index=index,
                    pattern_count=len(patterns),
                    source_path=source_path,
                    source_meta=source_meta,
                    now=now,
                )
            )
    return records


def import_style_seed_records(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> dict[str, Any]:
    inserted = 0
    duplicates: list[dict[str, str]] = []
    conflicts: list[dict[str, str]] = []
    insert_columns = [
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
        "created_by",
        "reviewed_by",
        "origin_type",
        "origin_engine",
        "origin_issue_id",
        "origin_review_session_id",
        "candidate_note",
        "draft_json",
        "created_at",
        "updated_at",
    ]
    for record in records:
        existing = conn.execute(
            "SELECT rule_key, pattern, message, source_path FROM team_manual_standard_rules WHERE rule_key = ?",
            (record["rule_key"],),
        ).fetchone()
        if existing:
            if existing["pattern"] == record["pattern"] and existing["message"] == record["message"]:
                duplicates.append({"rule_key": record["rule_key"], "source_path": record["source_path"]})
            else:
                conflicts.append({"rule_key": record["rule_key"], "source_path": record["source_path"]})
            continue
        conn.execute(
            f"""
            INSERT INTO team_manual_standard_rules ({", ".join(insert_columns)})
            VALUES ({", ".join("?" for _ in insert_columns)})
            """,
            [record[column] for column in insert_columns],
        )
        inserted += 1
    return {"inserted": inserted, "duplicates": duplicates, "conflicts": conflicts}


def import_style_seed_files(conn: sqlite3.Connection, team_standard_dir: Path) -> dict[str, Any]:
    sources: list[str] = []
    errors: list[dict[str, str]] = []
    total_inserted = 0
    duplicates: list[dict[str, str]] = []
    conflicts: list[dict[str, str]] = []
    for path in discover_style_seed_paths(team_standard_dir):
        source_path = path.relative_to(team_standard_dir.parents[1]).as_posix()
        sources.append(source_path)
        try:
            records = records_from_style_seed(path, display_source_path=source_path)
            result = import_style_seed_records(conn, records)
        except Exception as exc:
            errors.append({"source_path": source_path, "error": f"{type(exc).__name__}: {exc}"})
            continue
        total_inserted += int(result["inserted"])
        duplicates.extend(result["duplicates"])
        conflicts.extend(result["conflicts"])
    return {
        "sources": sources,
        "inserted": total_inserted,
        "duplicates": duplicates,
        "conflicts": conflicts,
        "errors": errors,
        "updated_at": utc_now(),
    }

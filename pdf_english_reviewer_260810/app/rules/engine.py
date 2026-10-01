from __future__ import annotations

from pathlib import Path
from typing import Any

from .loader import load_rule_payload, load_rules
from .matchers import run_regex_rule
from .models import RuleSource, TeamRule

EXTERNAL_PUBLISHING_STANDARD_IDS = {"microsoft", "ieee", "ams", "nist"}



def _format_db_rule_key(rule_key: str, legacy_rule_id: str) -> str:
    return (rule_key or legacy_rule_id or "").strip()


def run_team_standard_db_rules(text: str, rules: list[dict[str, Any]], *, role: str = "body") -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for item in rules:
        if not bool(item.get("enabled", True)):
            continue
        rule_key = _format_db_rule_key(str(item.get("rule_key") or ""), str(item.get("legacy_rule_id") or ""))
        pattern = str(item.get("pattern") or "")
        if pattern.startswith("__chicago_pilot__:"):
            from .chicago_pilot import run_chicago_matcher

            issues.extend(run_chicago_matcher(text, item))
            continue
        if str(item.get("matcher_type") or "regex") != "regex":
            continue
        rule = TeamRule(
            id=rule_key,
            title=str(item.get("title") or rule_key),
            category=str(item.get("category") or "consistency"),
            severity=str(item.get("severity") or "warning"),
            engine="team_rule",
            enabled=bool(item.get("enabled", True)),
            pattern_type="regex",
            pattern_value=pattern,
            suggestion=str(item.get("replacement") or ""),
            rationale=str(item.get("message") or item.get("description") or item.get("title") or rule_key),
            reference=str(item.get("source_path") or "data/reviewer.db:team_manual_standard_rules"),
            standard="Team Manual Standard",
            rule_category=str(item.get("category") or "consistency"),
            source=RuleSource(
                type=str(item.get("source_type") or "database"),
                name="Team Manual Standard",
                note=str(item.get("source_path") or "Canonical reviewer.db rule"),
            ),
            examples={},
            exceptions=[],
        )
        for issue in run_regex_rule(text, rule):
            issue["rule_key"] = rule_key
            issue["rule_id"] = rule_key
            issue["rule_reference"] = rule_key
            issue["rule_source"] = "Team Manual Standard"
            issue["standard"] = "Team Manual Standard"
            issue["engine"] = "team_rule"
            issue["message"] = str(item.get("message") or issue.get("message") or "")
            issues.append(issue)
    return issues


def run_team_standard_rules(text: str, rules_path: Path, *, role: str = "body") -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for rule in load_rules(rules_path):
        if rule.pattern_type == "regex":
            issues.extend(run_regex_rule(text, rule))
    return issues


def _standard_metadata(standard_dir: Path) -> dict[str, Any]:
    metadata_path = standard_dir / "metadata.yaml"
    payload = load_rule_payload(metadata_path) if metadata_path.exists() else {}
    identifier = str(payload.get("id") or standard_dir.name).strip()
    return {
        "id": identifier,
        "name": str(payload.get("name") or identifier).strip(),
        "version": str(payload.get("version") or "1").strip(),
        "purpose": str(payload.get("purpose") or "").strip(),
    }


def publishing_standard_registry(standards_dir: Path) -> list[dict[str, Any]]:
    if not standards_dir.exists():
        return []
    registry: list[dict[str, Any]] = []
    for standard_dir in sorted(path for path in standards_dir.iterdir() if path.is_dir()):
        metadata = _standard_metadata(standard_dir)
        if metadata["id"].casefold() not in EXTERNAL_PUBLISHING_STANDARD_IDS:
            continue
        rules = []
        for rules_path in sorted((standard_dir / "rules").glob("*.yaml")):
            for rule in load_rules(rules_path):
                rule.standard = metadata["id"]
                rule.engine = "publishing_standard"
                rule.source.name = metadata["id"]
                if not rule.reference:
                    rule.reference = metadata["name"]
                rules.append(rule.to_dict())
        registry.append({**metadata, "rules": rules, "rule_count": len(rules)})
    return registry


def publishing_standard_diagnostics(standards_dir: Path) -> dict[str, Any]:
    standards: list[dict[str, Any]] = []
    invalid_files: list[dict[str, str]] = []
    if not standards_dir.exists():
        return {"standards": standards, "invalid_files": [{"path": str(standards_dir), "error": "Standards directory is missing."}]}
    for standard_dir in sorted(path for path in standards_dir.iterdir() if path.is_dir()):
        try:
            metadata = _standard_metadata(standard_dir)
            if metadata["id"].casefold() not in EXTERNAL_PUBLISHING_STANDARD_IDS:
                continue
        except Exception as exc:
            invalid_files.append({"path": str(standard_dir / "metadata.yaml"), "error": f"{type(exc).__name__}: {exc}"})
            metadata = {"id": standard_dir.name, "name": standard_dir.name, "version": "", "purpose": ""}
        rule_count = 0
        for rules_path in sorted((standard_dir / "rules").glob("*.yaml")):
            try:
                rule_count += len(load_rules(rules_path))
            except Exception as exc:
                invalid_files.append({"path": str(rules_path), "error": f"{type(exc).__name__}: {exc}"})
        standards.append({**metadata, "rule_count": rule_count})
    return {"standards": standards, "invalid_files": invalid_files}


def run_publishing_standard_rules(
    text: str,
    standards_dir: Path,
    *,
    enabled_standards: set[str] | None = None,
    role: str = "body",
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    enabled_normalized = {item.casefold() for item in enabled_standards or set()}
    for standard_dir in sorted(path for path in standards_dir.iterdir() if path.is_dir()) if standards_dir.exists() else []:
        metadata = _standard_metadata(standard_dir)
        standard_id = metadata["id"]
        if standard_id.casefold() not in EXTERNAL_PUBLISHING_STANDARD_IDS:
            continue
        if enabled_normalized and standard_id.casefold() not in enabled_normalized:
            continue
        for rules_path in sorted((standard_dir / "rules").glob("*.yaml")):
            for rule in load_rules(rules_path):
                if rule.pattern_type != "regex":
                    continue
                rule.engine = "publishing_standard"
                rule.standard = standard_id
                rule.source.name = standard_id
                if not rule.reference:
                    rule.reference = metadata["name"]
                issues.extend(run_regex_rule(text, rule))
    return issues


def rule_registry(rules_path: Path) -> list[dict[str, Any]]:
    payload = load_rule_payload(rules_path)
    return [rule.to_dict() for rule in load_rules(rules_path)] if payload else []

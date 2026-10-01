from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

from app.rules.builtin_rules import BUILTIN_RULE_SOURCES

EXTERNAL_PUBLISHING_STANDARD_IDS = {"microsoft", "ieee", "ams", "nist"}


def _read_yaml(path: Path) -> dict[str, Any]:
    if yaml is None or not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _rule_key(source: str, standard_or_engine: str, rule_id: str) -> str:
    return f"{source}:{standard_or_engine}:{rule_id}"


def _hash_key(*parts: str) -> str:
    return hashlib.sha1("\u001f".join(parts).encode("utf-8")).hexdigest()[:16]


def _base_rule(
    *,
    rule_key: str,
    rule_id: str,
    rule_name: str,
    rule_source: str,
    standard: str,
    engine: str,
    category: str = "",
    severity: str = "",
    description: str = "",
    pattern_type: str = "",
    pattern: str = "",
    replacement: str = "",
    enabled: bool = True,
    configuration_source: str = "",
    status: str = "Active",
    derived: bool = False,
) -> dict[str, Any]:
    return {
        "rule_key": rule_key,
        "rule_id": rule_id,
        "rule_name": rule_name or rule_id,
        "rule_source": rule_source,
        "standard": standard,
        "engine": engine,
        "category": category,
        "severity": severity,
        "description": description,
        "pattern_type": pattern_type,
        "pattern": pattern,
        "replacement": replacement,
        "enabled": bool(enabled),
        "configuration_source": configuration_source,
        "rule_status": status if enabled else "Disabled",
        "derived": derived,
    }


def load_publishing_standard_rules(standards_dir: Path) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    if not standards_dir.exists():
        return rules
    for standard_dir in sorted(path for path in standards_dir.iterdir() if path.is_dir()):
        metadata = _read_yaml(standard_dir / "metadata.yaml")
        standard_id = str(metadata.get("id") or standard_dir.name)
        if standard_id.casefold() not in EXTERNAL_PUBLISHING_STANDARD_IDS:
            continue
        standard_name = str(metadata.get("name") or standard_id)
        for rule_file in sorted((standard_dir / "rules").glob("*.yaml")):
            payload = _read_yaml(rule_file)
            for item in payload.get("rules", []) or []:
                pattern = item.get("pattern") or {}
                source = item.get("source") or {}
                rule_id = str(item.get("id") or "").strip()
                if not rule_id:
                    continue
                rules.append(
                    _base_rule(
                        rule_key=_rule_key("publishing_standard", standard_id, rule_id),
                        rule_id=rule_id,
                        rule_name=str(item.get("title") or rule_id),
                        rule_source="publishing_standard",
                        standard=standard_id,
                        engine="publishing_standard",
                        category=str(item.get("category") or ""),
                        severity=str(item.get("severity") or ""),
                        description=str(item.get("rationale") or source.get("note") or ""),
                        pattern_type=str(pattern.get("type") or ""),
                        pattern=str(pattern.get("value") or ""),
                        replacement=str(item.get("suggestion") or ""),
                        enabled=bool(item.get("enabled", True)),
                        configuration_source=f"config/standards/{standard_dir.name}/rules/{rule_file.name}",
                        status="Active",
                    )
                    | {"standard_name": standard_name}
                )
    return rules


def load_team_rules(team_rules_path: Path) -> list[dict[str, Any]]:
    payload = _read_yaml(team_rules_path)
    rules: list[dict[str, Any]] = []
    for item in payload.get("rules", []) or []:
        source = item.get("source") or {}
        pattern = item.get("pattern") or {}
        rule_id = str(item.get("id") or "").strip()
        if not rule_id:
            continue
        standard = str(item.get("standard") or source.get("name") or "TeamManual")
        rules.append(
            _base_rule(
                rule_key=_rule_key("team_rule", standard, rule_id),
                rule_id=rule_id,
                rule_name=str(item.get("title") or rule_id),
                rule_source="team_rule",
                standard=standard,
                engine="team_rule",
                category=str(item.get("category") or ""),
                severity=str(item.get("severity") or ""),
                description=str(item.get("rationale") or source.get("note") or ""),
                pattern_type=str(pattern.get("type") or ""),
                pattern=str(pattern.get("value") or ""),
                replacement=str(item.get("suggestion") or ""),
                enabled=bool(item.get("enabled", True)),
                configuration_source="config/team_standard/rules.yaml",
            )
        )
    return rules


def load_vale_rules(vale_styles_dir: Path) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    if not vale_styles_dir.exists():
        return rules
    for path in sorted(vale_styles_dir.iterdir()):
        if not path.is_file() or not (path.name.endswith(".yml") or path.name.endswith(".yml.disabled")):
            continue
        enabled = not path.name.endswith(".disabled")
        visible_name = path.name.replace(".disabled", "")
        rule_name = Path(visible_name).stem
        payload = _read_yaml(path)
        tokens = payload.get("tokens") or payload.get("swap") or ""
        if isinstance(tokens, (dict, list)):
            pattern = json.dumps(tokens, ensure_ascii=False)
        else:
            pattern = str(tokens or "")
        rule_id = f"TeamManual.{rule_name}"
        rules.append(
            _base_rule(
                rule_key=_rule_key("vale", "TeamManual", rule_id),
                rule_id=rule_id,
                rule_name=rule_name,
                rule_source="vale",
                standard="TeamManual",
                engine="vale",
                category="consistency" if rule_name == "Terms" else "format" if rule_name == "Units" else "awkward",
                severity="major" if str(payload.get("level", "")).casefold() == "error" else "minor",
                description=str(payload.get("message") or ""),
                pattern_type=str(payload.get("extends") or ""),
                pattern=pattern,
                replacement=str(payload.get("message") or ""),
                enabled=enabled,
                configuration_source=f"config/vale/styles/TeamManual/{path.name}",
            )
        )
    return rules


def load_basic_rules() -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for rule_id, (engine, source, description) in sorted(BUILTIN_RULE_SOURCES.items()):
        standard = "BuiltIn" if engine == "basic" else source
        rules.append(
            _base_rule(
                rule_key=_rule_key("basic", standard, rule_id),
                rule_id=rule_id,
                rule_name=rule_id.replace("_", " ").title(),
                rule_source="basic",
                standard=standard,
                engine=engine,
                category="consistency" if "spacing" in rule_id or "notation" in rule_id else "typo",
                severity="minor",
                description=description,
                pattern_type="code",
                pattern="Defined in app.main.check_basic_rules",
                replacement="Code-defined",
                enabled=True,
                configuration_source="app/main.py",
            )
        )
    return rules


def load_glossary_rules(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, project_id, scope, term_type, source_term, preferred_term,
               description, case_sensitive, active, created_at, updated_at
        FROM glossary_terms
        ORDER BY project_id, scope, source_term
        """
    ).fetchall()
    rules: list[dict[str, Any]] = []
    for row in rows:
        row_dict = dict(row)
        rule_id = str(row_dict["id"])
        standard = f"{row_dict['project_id']}:{row_dict['scope']}"
        condition = row_dict["source_term"]
        if row_dict["case_sensitive"]:
            condition += " (case-sensitive)"
        rules.append(
            _base_rule(
                rule_key=_rule_key("glossary", standard, rule_id),
                rule_id=rule_id,
                rule_name=str(row_dict["source_term"]),
                rule_source="glossary",
                standard=standard,
                engine="glossary",
                category="consistency",
                severity="minor",
                description=str(row_dict["description"] or row_dict["term_type"]),
                pattern_type="term",
                pattern=condition,
                replacement=str(row_dict["preferred_term"] or ""),
                enabled=bool(row_dict["active"]),
                configuration_source="data/reviewer.db:glossary_terms",
            )
            | {
                "project": row_dict["project_id"],
                "scope": row_dict["scope"],
                "term_type": row_dict["term_type"],
                "created_at": row_dict["created_at"],
                "updated_at": row_dict["updated_at"],
            }
        )
    return rules


def load_rule_registry(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT rule_id, title, engine, category, severity, source, enabled,
               config_path, created_at, updated_at
        FROM rule_registry
        ORDER BY rule_id
        """
    ).fetchall()
    rules: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        rule_id = str(item["rule_id"] or "")
        if not rule_id:
            continue
        engine = str(item["engine"] or "registry")
        source = str(item["source"] or engine)
        rules.append(
            _base_rule(
                rule_key=_rule_key("rule_registry", source, rule_id),
                rule_id=rule_id,
                rule_name=str(item["title"] or rule_id),
                rule_source="rule_registry",
                standard=source,
                engine=engine,
                category=str(item["category"] or ""),
                severity=str(item["severity"] or ""),
                description="Promoted or registry overlay rule.",
                pattern_type="registry",
                pattern="Not available",
                replacement="Not available",
                enabled=bool(item["enabled"]),
                configuration_source=str(item["config_path"] or "data/reviewer.db:rule_registry"),
                status="Legacy",
            )
            | {"created_at": item["created_at"], "updated_at": item["updated_at"]}
        )
    return rules


def observed_languagetool_rules(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT rule_id, rule_reference, message, category, severity, COUNT(*) AS trigger_count,
               MIN(created_at) AS first_triggered, MAX(created_at) AS last_triggered
        FROM issues
        WHERE engine = 'languagetool'
        GROUP BY COALESCE(NULLIF(rule_id, ''), rule_reference), message, category, severity
        ORDER BY trigger_count DESC
        """
    ).fetchall()
    rules: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        rule_id = str(item["rule_id"] or item["rule_reference"] or "languagetool")
        rules.append(
            _base_rule(
                rule_key=_rule_key("languagetool", "LanguageTool", rule_id),
                rule_id=rule_id,
                rule_name=rule_id,
                rule_source="languagetool",
                standard="LanguageTool",
                engine="languagetool",
                category=str(item["category"] or ""),
                severity=str(item["severity"] or ""),
                description=str(item["message"] or "Observed LanguageTool rule"),
                pattern_type="observed",
                pattern="Not available",
                replacement="Not available",
                enabled=True,
                configuration_source="Observed findings in data/reviewer.db:issues",
                status="Legacy",
            )
            | {
                "trigger_count": int(item["trigger_count"] or 0),
                "first_triggered": item["first_triggered"],
                "last_triggered": item["last_triggered"],
            }
        )
    return rules


def build_rule_catalog(
    *,
    standards_dir: Path,
    team_rules_path: Path,
    vale_styles_dir: Path,
    conn,
    include_languagetool: bool = False,
) -> list[dict[str, Any]]:
    rules = [
        *load_publishing_standard_rules(standards_dir),
        *load_team_rules(team_rules_path),
        *load_vale_rules(vale_styles_dir),
        *load_glossary_rules(conn),
        *load_basic_rules(),
        *load_rule_registry(conn),
    ]
    if include_languagetool:
        rules.extend(observed_languagetool_rules(conn))
    by_key: dict[str, dict[str, Any]] = {}
    for rule in rules:
        key = rule["rule_key"]
        if key in by_key:
            by_key[key]["rule_status"] = "Duplicate Candidate"
        else:
            by_key[key] = rule
    return list(by_key.values())


def derived_glossary_key(project: str, scope: str, source_text: str, replacement: str) -> str:
    digest = _hash_key(project, scope, source_text, replacement)
    return _rule_key("glossary", f"{project}:{scope}", f"Derived-{digest}")

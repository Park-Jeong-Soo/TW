from __future__ import annotations

from pathlib import Path
from typing import Any

from .models import TeamRule

try:
    import yaml
except ImportError:  # pragma: no cover - surfaced by preflight/tests
    yaml = None


def load_rules(path: Path) -> list[TeamRule]:
    if not path.exists():
        return []
    if yaml is None:
        raise RuntimeError("PyYAML is required to load team standard rules.")
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rules = []
    for item in payload.get("rules", []):
        rule = TeamRule.from_dict(item or {})
        if rule.id and rule.enabled:
            rules.append(rule)
    return rules


def load_rule_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "rules": []}
    if yaml is None:
        raise RuntimeError("PyYAML is required to load team standard rules.")
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {"version": 1, "rules": []}

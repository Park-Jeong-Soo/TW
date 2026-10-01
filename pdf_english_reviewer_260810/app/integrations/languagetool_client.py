from __future__ import annotations

from pathlib import Path


def load_disabled_languagetool_rules(path: Path) -> list[str]:
    if not path.exists():
        return []
    rules: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if value and not value.startswith("#"):
            rules.append(value)
    return rules

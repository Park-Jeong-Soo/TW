from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class RuleSource:
    type: str = "internal"
    name: str = "TeamManual"
    note: str = "Company team standard."


@dataclass(slots=True)
class TeamRule:
    id: str
    title: str
    category: str
    severity: str
    engine: str = "team_rule"
    enabled: bool = True
    pattern_type: str = "regex"
    pattern_value: str = ""
    suggestion: str = ""
    rationale: str = ""
    reference: str = ""
    standard: str = ""
    rule_category: str = ""
    source: RuleSource = field(default_factory=RuleSource)
    examples: dict[str, Any] = field(default_factory=dict)
    exceptions: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, item: dict[str, Any]) -> "TeamRule":
        source = item.get("source") or {}
        pattern = item.get("pattern") or {}
        return cls(
            id=str(item.get("id", "")).strip(),
            title=str(item.get("title", "")).strip(),
            category=str(item.get("category", "consistency")).strip(),
            severity=str(item.get("severity", "minor")).strip(),
            engine=str(item.get("engine", "team_rule")).strip() or "team_rule",
            enabled=bool(item.get("enabled", True)),
            pattern_type=str(pattern.get("type", "regex")).strip(),
            pattern_value=str(pattern.get("value", "")).strip(),
            suggestion=str(item.get("suggestion", "")).strip(),
            rationale=str(item.get("rationale", "")).strip(),
            reference=str(item.get("reference", "")).strip(),
            standard=str(item.get("standard", "")).strip(),
            rule_category=str(item.get("rule_category", item.get("category", ""))).strip(),
            source=RuleSource(
                type=str(source.get("type", "internal")),
                name=str(source.get("name", "TeamManual")),
                note=str(source.get("note", "Company team standard.")),
            ),
            examples=dict(item.get("examples") or {}),
            exceptions=list(item.get("exceptions") or []),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "severity": self.severity,
            "engine": self.engine,
            "enabled": self.enabled,
            "pattern": {"type": self.pattern_type, "value": self.pattern_value},
            "suggestion": self.suggestion,
            "rationale": self.rationale,
            "reference": self.reference,
            "standard": self.standard,
            "rule_category": self.rule_category or self.category,
            "source": {"type": self.source.type, "name": self.source.name, "note": self.source.note},
            "examples": self.examples,
            "exceptions": self.exceptions,
        }

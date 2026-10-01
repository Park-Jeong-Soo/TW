from __future__ import annotations

from typing import Any


def deduplicate_by_priority(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    engine_priority = {"team_rule": 0, "glossary": 1, "publishing_standard": 4, "vale": 6, "languagetool": 7, "basic": 8, "ollama": 9}
    standard_priority = {"team manual standard": 0, "teammanual": 0, "nist": 2, "ieee": 3, "ams": 4, "microsoft": 5}

    def source_label(issue: dict[str, Any]) -> str:
        return str(issue.get("standard") or issue.get("rule_source") or issue.get("engine") or "").strip()

    def with_source(issue: dict[str, Any]) -> dict[str, Any]:
        item = dict(issue)
        sources = list(item.get("sources") or [])
        label = source_label(item)
        if label:
            sources.append(label)
        item["sources"] = sorted(set(filter(None, sources)))
        return item

    def rank(issue: dict[str, Any]) -> tuple[int, int]:
        standard = str(issue.get("standard") or issue.get("rule_source") or "").casefold()
        engine = str(issue.get("engine") or "")
        return (
            standard_priority.get(standard, engine_priority.get(engine, 20)),
            engine_priority.get(engine, 20),
        )

    grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for issue in issues:
        issue = with_source(issue)
        key = (
            str(issue.get("source_text", "")).casefold(),
            str(issue.get("replacement") or issue.get("suggestion", "")).casefold(),
            str(issue.get("rule_category") or issue.get("category", "")),
        )
        current = grouped.get(key)
        if current is None or rank(issue) < rank(current):
            related_engines = [] if current is None else list(current.get("related_engines", [])) + [str(current.get("engine"))]
            related_rules = [] if current is None else list(current.get("related_rules", [])) + [str(current.get("rule_id") or current.get("rule_reference"))]
            related_standards = [] if current is None else list(current.get("related_standards", [])) + [str(current.get("standard") or current.get("rule_source"))]
            issue = dict(issue)
            issue["sources"] = sorted(set(filter(None, list(issue.get("sources", [])) + list((current or {}).get("sources", [])))))
            issue["related_engines"] = sorted(set(filter(None, related_engines + list(issue.get("related_engines", [])))))
            issue["related_rules"] = sorted(set(filter(None, related_rules + list(issue.get("related_rules", [])))))
            issue["related_standards"] = sorted(set(filter(None, related_standards + list(issue.get("related_standards", [])))))
            grouped[key] = issue
        elif current is not None:
            related_engines = set(current.get("related_engines", []))
            related_engines.add(str(issue.get("engine")))
            current["related_engines"] = sorted(filter(None, related_engines))
            related_rules = set(current.get("related_rules", []))
            related_rules.add(str(issue.get("rule_id") or issue.get("rule_reference")))
            current["related_rules"] = sorted(filter(None, related_rules))
            related_standards = set(current.get("related_standards", []))
            related_standards.add(str(issue.get("standard") or issue.get("rule_source")))
            current["related_standards"] = sorted(filter(None, related_standards))
            current["sources"] = sorted(set(filter(None, list(current.get("sources", [])) + list(issue.get("sources", [])))))
    return list(grouped.values())

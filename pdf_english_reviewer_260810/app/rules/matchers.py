from __future__ import annotations

import re
from typing import Any

from .models import TeamRule


def _format_suggestion(template: str, match: re.Match[str]) -> str:
    if not template:
        return ""
    values: dict[str, Any] = {"match": match.group(0)}
    values.update({str(i): value for i, value in enumerate(match.groups(), start=1)})
    values.update(match.groupdict())
    if "number" not in values and len(match.groups()) >= 1:
        values["number"] = match.group(1)
    if "unit" not in values and len(match.groups()) >= 2:
        values["unit"] = match.group(2)
    try:
        return template.format(**values)
    except (KeyError, IndexError, ValueError):
        return template.replace("{match}", match.group(0))


def _first_example(value: Any) -> str:
    if isinstance(value, list):
        return str(value[0]) if value else ""
    return str(value or "")


def _format_example(examples: dict[str, Any]) -> str:
    bad = examples.get("bad")
    good = examples.get("good")
    bad_text = _first_example(bad)
    good_text = _first_example(good)
    if bad_text and good_text:
        return f"Wrong: {bad_text} | Correct: {good_text}"
    return str(good_text or bad_text or "")


def run_regex_rule(text: str, rule: TeamRule) -> list[dict[str, Any]]:
    try:
        pattern = re.compile(rule.pattern_value)
    except re.error:
        return []
    issues = []
    for match in pattern.finditer(text):
        source = match.group(0)
        replacement = _format_suggestion(rule.suggestion, match)
        bad_example = _first_example(rule.examples.get("bad"))
        good_example = _first_example(rule.examples.get("good"))
        issues.append(
            {
                "source_text": source,
                "replacement": replacement,
                "category": rule.category,
                "level": "correction",
                "severity": rule.severity,
                "confidence": 0.96,
                "explanation_en": rule.rationale or rule.title,
                "explanation_ko": "팀 문서 표준 규칙에 따른 제안입니다.",
                "rule_reference": rule.id,
                "rule_id": rule.id,
                "engine": rule.engine,
                "rule_source": rule.source.name,
                "rationale": rule.rationale or rule.title,
                "standard": rule.standard or rule.source.name,
                "rule_category": rule.rule_category or rule.category,
                "reference": rule.reference or rule.source.note,
                "reason": rule.rationale or rule.title,
                "message": rule.rationale or rule.title,
                "suggestion": replacement or rule.suggestion,
                "example": _format_example(rule.examples),
                "bad_example": bad_example,
                "good_example": good_example,
                "profile": "",
                "offset": match.start(),
            }
        )
    return issues

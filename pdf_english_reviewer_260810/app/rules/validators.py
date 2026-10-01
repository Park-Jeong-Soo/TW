from __future__ import annotations

ALLOWED_CATEGORIES = {"typo", "grammar", "awkward", "content", "consistency", "format"}
ALLOWED_SEVERITIES = {"critical", "major", "minor"}


def validate_issue_taxonomy(category: str, severity: str) -> tuple[str, str]:
    normalized_category = category if category in ALLOWED_CATEGORIES else "consistency"
    normalized_severity = severity.lower() if severity.lower() in ALLOWED_SEVERITIES else "minor"
    return normalized_category, normalized_severity

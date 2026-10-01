
from __future__ import annotations

from typing import Any


def mark_unmapped_issue(issue: dict[str, Any]) -> dict[str, Any]:
    item = dict(issue)
    item.setdefault("annotation_available", False)
    item.setdefault("mapping_status", "not_mapped")
    item.setdefault("display_scope", "review_panel_only")
    return item

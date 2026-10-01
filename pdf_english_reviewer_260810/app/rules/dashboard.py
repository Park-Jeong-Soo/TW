from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.rules.catalog import build_rule_catalog, derived_glossary_key


STATUS_VALUES = ("open", "accepted", "rejected", "ignored_by_rule")


def _clamp_limit(limit: int) -> int:
    return max(1, min(500, int(limit or 50)))


def _offset(page: int, limit: int) -> int:
    return max(0, int(page or 1) - 1) * limit


def issue_rule_key(issue: dict[str, Any]) -> str:
    engine = str(issue.get("engine") or "basic")
    rule_id = str(issue.get("rule_id") or issue.get("rule_reference") or "local_rule")
    standard = str(issue.get("standard") or issue.get("rule_source") or engine or "Unknown")
    if engine == "publishing_standard":
        return f"publishing_standard:{standard}:{rule_id}"
    if engine == "team_rule":
        if rule_id in {"basic_number_unit_spacing", "basic_range_notation", "basic_arrow_notation", "fixed_figure_title_case"}:
            return f"basic:{standard}:{rule_id}"
        return f"team_rule:{standard}:{rule_id}"
    if engine == "vale":
        return f"vale:TeamManual:{rule_id}"
    if engine == "glossary" or rule_id.startswith("glossary_"):
        return derived_glossary_key(
            str(issue.get("project_name") or issue.get("project") or "Project"),
            "Derived",
            str(issue.get("source_text") or ""),
            str(issue.get("replacement") or ""),
        )
    if engine == "languagetool":
        return f"languagetool:LanguageTool:{rule_id}"
    if engine == "ollama":
        return f"ai_context:Ollama:{rule_id}"
    if engine == "basic":
        return f"basic:BuiltIn:{rule_id}"
    return f"{engine}:{standard}:{rule_id}"


def _row_dict(row: Any) -> dict[str, Any]:
    return dict(row)


def _catalog_map(catalog: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["rule_key"]: item for item in catalog}


def finding_rows(conn, filters: dict[str, Any]) -> list[dict[str, Any]]:
    clauses = ["1=1"]
    values: list[Any] = []
    if filters.get("search"):
        value = f"%{filters['search']}%"
        clauses.append(
            "(i.rule_id LIKE ? OR i.rule_reference LIKE ? OR i.source_text LIKE ? OR "
            "i.replacement LIKE ? OR i.message LIKE ? OR d.filename LIKE ? OR d.project_name LIKE ?)"
        )
        values.extend([value] * 7)
    for key, column in (
        ("project", "d.project_name"),
        ("document_id", "i.document_id"),
        ("engine", "i.engine"),
        ("standard", "i.standard"),
        ("category", "i.category"),
        ("severity", "i.severity"),
        ("status", "i.status"),
        ("reviewer", "d.reviewer"),
    ):
        if filters.get(key) and filters[key] != "all":
            clauses.append(f"{column} = ?")
            values.append(filters[key])
    if filters.get("date_from"):
        clauses.append("i.created_at >= ?")
        values.append(filters["date_from"])
    if filters.get("date_to"):
        clauses.append("i.created_at <= ?")
        values.append(filters["date_to"])
    where = " AND ".join(clauses)
    rows = conn.execute(
        f"""
        SELECT
            i.*,
            d.filename AS document_name,
            d.project_name AS project_name,
            d.reviewer AS reviewer,
            rs.created_at AS review_date
        FROM issues i
        LEFT JOIN documents d ON d.id = i.document_id
        LEFT JOIN review_sessions rs ON rs.id = i.review_session_id
        WHERE {where}
        ORDER BY i.created_at DESC, i.page ASC
        """,
        values,
    ).fetchall()
    return [_row_dict(row) for row in rows]


def _finding_payload(issue: dict[str, Any], catalog_by_key: dict[str, dict[str, Any]]) -> dict[str, Any]:
    key = issue_rule_key(issue)
    catalog = catalog_by_key.get(key, {})
    if issue.get("engine") == "ollama":
        rule_source = "AI Context Finding"
        rule_name = "AI Context Finding"
    else:
        rule_source = str(issue.get("rule_source") or catalog.get("rule_source") or "")
        rule_name = str(catalog.get("rule_name") or issue.get("rule_id") or issue.get("rule_reference") or "")
    return {
        "issue_id": issue.get("id"),
        "document_id": issue.get("document_id"),
        "document": issue.get("document_name") or "",
        "project": issue.get("project_name") or "",
        "review_session": issue.get("review_session_id") or "",
        "review_date": issue.get("review_date") or "",
        "page": issue.get("page"),
        "rule_key": key,
        "rule_id": issue.get("rule_id") or issue.get("rule_reference") or "",
        "rule_name": rule_name,
        "rule_source": rule_source,
        "engine": issue.get("engine") or "",
        "standard": issue.get("standard") or issue.get("rule_source") or "",
        "category": issue.get("category") or "",
        "severity": issue.get("severity") or "",
        "source_text": issue.get("source_text") or "",
        "suggested_text": issue.get("suggestion") or issue.get("replacement") or "",
        "message": issue.get("message") or issue.get("explanation_en") or "",
        "status": issue.get("status") or "open",
        "reviewer": issue.get("reviewer") or "",
        "reviewer_comment": issue.get("reviewer_comment") or "",
        "detected_at": issue.get("created_at") or "",
        "bbox": issue.get("bbox_json") or "",
    }


def _stats_by_rule(findings: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = {}
    for finding in findings:
        key = finding["rule_key"]
        item = stats.setdefault(
            key,
            {
                "rule_key": key,
                "trigger_count": 0,
                "affected_documents": set(),
                "affected_projects": set(),
                "open_count": 0,
                "accepted_count": 0,
                "rejected_count": 0,
                "ignored_count": 0,
                "first_triggered": "",
                "last_triggered": "",
            },
        )
        item["trigger_count"] += 1
        if finding.get("document_id"):
            item["affected_documents"].add(finding["document_id"])
        if finding.get("project"):
            item["affected_projects"].add(finding["project"])
        status = str(finding.get("status") or "open")
        if status == "ignored_by_rule":
            item["ignored_count"] += 1
        elif status in {"open", "accepted", "rejected"}:
            item[f"{status}_count"] += 1
        detected = str(finding.get("detected_at") or "")
        if detected:
            if not item["first_triggered"] or detected < item["first_triggered"]:
                item["first_triggered"] = detected
            if not item["last_triggered"] or detected > item["last_triggered"]:
                item["last_triggered"] = detected
    for item in stats.values():
        item["affected_documents"] = len(item["affected_documents"])
        item["affected_projects"] = len(item["affected_projects"])
        trigger = item["trigger_count"] or 1
        item["acceptance_rate"] = round(item["accepted_count"] / trigger, 4)
        item["rejection_rate"] = round(item["rejected_count"] / trigger, 4)
        item["ignore_rate"] = round(item["ignored_count"] / trigger, 4)
        item["false_positive_candidate"] = (
            item["trigger_count"] >= 5
            and (item["rejected_count"] + item["ignored_count"]) / trigger >= 0.6
        )
    return stats


def dashboard_data(
    *,
    conn,
    standards_dir: Path,
    team_rules_path: Path,
    vale_styles_dir: Path,
    filters: dict[str, Any] | None = None,
    include_languagetool: bool = False,
) -> dict[str, Any]:
    filters = filters or {}
    catalog = build_rule_catalog(
        standards_dir=standards_dir,
        team_rules_path=team_rules_path,
        vale_styles_dir=vale_styles_dir,
        conn=conn,
        include_languagetool=include_languagetool,
    )
    catalog_by_key = _catalog_map(catalog)
    raw_findings = finding_rows(conn, filters)
    findings = [_finding_payload(row, catalog_by_key) for row in raw_findings]
    stats = _stats_by_rule(findings)
    inventory: list[dict[str, Any]] = []
    for rule in catalog:
        item = dict(rule)
        rule_stats = stats.get(rule["rule_key"], {})
        for key in (
            "trigger_count", "affected_documents", "affected_projects",
            "open_count", "accepted_count", "rejected_count", "ignored_count",
            "first_triggered", "last_triggered", "acceptance_rate",
            "rejection_rate", "ignore_rate", "false_positive_candidate",
        ):
            item[key] = rule_stats.get(key, 0 if key.endswith("_count") or key in {"trigger_count", "affected_documents", "affected_projects"} else "")
        if item.get("rule_status") not in {"Disabled", "Duplicate Candidate", "Legacy", "Derived", "Invalid"}:
            item["rule_status"] = "Active" if item["trigger_count"] else "Unused"
        inventory.append(item)
    known_keys = {item["rule_key"] for item in inventory}
    for finding in findings:
        if finding["rule_key"] not in known_keys and not finding["rule_key"].startswith("ai_context:"):
            inventory.append(
                {
                    "rule_key": finding["rule_key"],
                    "rule_id": finding["rule_id"],
                    "rule_name": finding["rule_name"] or finding["rule_id"],
                    "rule_source": finding["rule_source"] or finding["engine"],
                    "standard": finding["standard"],
                    "engine": finding["engine"],
                    "category": finding["category"],
                    "severity": finding["severity"],
                    "description": finding["message"],
                    "pattern_type": "missing_definition",
                    "pattern": "Not available",
                    "replacement": "Not available",
                    "enabled": False,
                    "configuration_source": "Observed finding without current definition",
                    "rule_status": "Missing Definition",
                    **stats.get(finding["rule_key"], {}),
                }
            )
            known_keys.add(finding["rule_key"])
    return {"inventory": inventory, "findings": findings, "statistics": list(stats.values())}


def _matches_inventory_filters(item: dict[str, Any], filters: dict[str, Any]) -> bool:
    search = str(filters.get("search") or "").casefold()
    if search:
        blob = " ".join(str(item.get(key, "")) for key in (
            "rule_key", "rule_id", "rule_name", "rule_source", "standard",
            "engine", "category", "severity", "description", "pattern", "replacement",
        )).casefold()
        if search not in blob:
            return False
    for key in ("rule_source", "engine", "standard", "category", "severity"):
        value = filters.get(key)
        if value and value != "all" and str(item.get(key) or "") != value:
            return False
    status = filters.get("rule_status")
    if status and status != "all" and str(item.get("rule_status") or "") != status:
        return False
    enabled = filters.get("enabled")
    if enabled == "enabled" and not item.get("enabled"):
        return False
    if enabled == "disabled" and item.get("enabled"):
        return False
    triggered = filters.get("triggered")
    if triggered == "triggered" and not item.get("trigger_count"):
        return False
    if triggered == "unused" and item.get("trigger_count"):
        return False
    return True


def paginate(items: list[dict[str, Any]], page: int, limit: int) -> dict[str, Any]:
    limit = _clamp_limit(limit)
    offset = _offset(page, limit)
    return {
        "items": items[offset: offset + limit],
        "page": max(1, int(page or 1)),
        "limit": limit,
        "total": len(items),
    }


def inventory_response(data: dict[str, Any], filters: dict[str, Any], page: int, limit: int) -> dict[str, Any]:
    items = [item for item in data["inventory"] if _matches_inventory_filters(item, filters)]
    sort = filters.get("sort") or "rule_key"
    reverse = filters.get("order") == "desc"
    items.sort(key=lambda item: str(item.get(sort) or item.get("rule_key") or ""), reverse=reverse)
    return paginate(items, page, limit)


def findings_response(data: dict[str, Any], page: int, limit: int) -> dict[str, Any]:
    return paginate(data["findings"], page, limit)


def summary_response(data: dict[str, Any]) -> dict[str, Any]:
    inventory = data["inventory"]
    findings = data["findings"]
    statuses = Counter(str(item.get("status") or "open") for item in findings)
    engines = Counter(str(item.get("engine") or "") for item in findings)
    standards = Counter(str(item.get("standard") or "") for item in findings)
    triggered_keys = {item["rule_key"] for item in findings if not item["rule_key"].startswith("ai_context:")}
    most_rule = Counter(item["rule_key"] for item in findings).most_common(1)
    review_dates = [str(item.get("review_date") or item.get("detected_at") or "") for item in findings if item.get("review_date") or item.get("detected_at")]
    false_positive = [
        item for item in data["statistics"]
        if item.get("false_positive_candidate")
    ]
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total_rules": len(inventory),
        "enabled_rules": sum(1 for item in inventory if item.get("enabled")),
        "disabled_rules": sum(1 for item in inventory if not item.get("enabled")),
        "triggered_rules": len(triggered_keys),
        "unused_rules": sum(1 for item in inventory if not item.get("trigger_count") and item.get("enabled")),
        "total_findings": len(findings),
        "open_findings": statuses.get("open", 0),
        "accepted_findings": statuses.get("accepted", 0),
        "rejected_findings": statuses.get("rejected", 0),
        "ignored_findings": statuses.get("ignored_by_rule", 0),
        "most_triggered_rule": most_rule[0][0] if most_rule else "",
        "most_triggered_engine": engines.most_common(1)[0][0] if engines else "",
        "most_triggered_standard": standards.most_common(1)[0][0] if standards else "",
        "documents_reviewed": len({item.get("document_id") for item in findings if item.get("document_id")}),
        "last_review_date": max(review_dates) if review_dates else "",
        "false_positive_candidates": len(false_positive),
        "engine_counts": dict(engines),
        "standard_counts": dict(standards),
        "status_counts": dict(statuses),
        "top_rules": [
            {"rule_key": key, "trigger_count": count}
            for key, count in Counter(item["rule_key"] for item in findings).most_common(10)
        ],
    }

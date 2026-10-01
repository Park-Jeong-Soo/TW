from __future__ import annotations

from typing import Any

from app.rules.builtin_rules import BUILTIN_RULE_SOURCES


def enrich_issue_evidence(issue: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(issue)
    rule_id = str(enriched.get("rule_id") or enriched.get("rule_reference") or "local_rule")
    engine = str(enriched.get("engine") or "")
    source = str(enriched.get("rule_source") or "")
    rationale = str(enriched.get("rationale") or enriched.get("explanation_en") or "")
    if not engine or not source:
        builtin = BUILTIN_RULE_SOURCES.get(rule_id)
        if builtin:
            engine = engine or builtin[0]
            source = source or builtin[1]
            rationale = rationale or builtin[2]
        elif rule_id.startswith("glossary_"):
            engine = engine or "glossary"
            source = source or "Manual Glossary"
        elif rule_id.startswith("CMOS_"):
            engine = engine or "languagetool"
            source = source or "Chicago-derived internal LanguageTool rule"
        elif rule_id == "ollama_review_criteria":
            engine = engine or "ollama"
            source = source or "Local optional context review"
        elif rule_id and rule_id != "languagetool":
            engine = engine or "languagetool"
            source = source or "LanguageTool"
    enriched["rule_id"] = rule_id
    enriched["engine"] = engine or "basic"
    enriched["rule_source"] = source or "Internal reviewer rule"
    enriched["rationale"] = rationale or "Local rule-based review evidence."
    enriched["standard"] = enriched.get("standard") or enriched["rule_source"]
    enriched["rule_category"] = enriched.get("rule_category") or enriched.get("category", "")
    enriched["reference"] = enriched.get("reference") or enriched["rule_source"]
    enriched["message"] = enriched.get("message") or enriched.get("explanation_en") or enriched["rationale"]
    enriched["suggestion"] = enriched.get("suggestion") or enriched.get("replacement", "")
    enriched["bad_example"] = enriched.get("bad_example") or ""
    enriched["good_example"] = enriched.get("good_example") or ""
    enriched["profile"] = enriched.get("profile") or ""
    enriched["related_engines"] = list(enriched.get("related_engines") or [])
    enriched["related_rules"] = list(enriched.get("related_rules") or [])
    enriched["related_standards"] = list(enriched.get("related_standards") or [])
    enriched["reviewer_decision"] = enriched.get("reviewer_decision") or "pending"
    enriched["reviewer_note"] = enriched.get("reviewer_note") or ""
    enriched["promoted_to_rule"] = int(bool(enriched.get("promoted_to_rule", 0)))
    return enriched

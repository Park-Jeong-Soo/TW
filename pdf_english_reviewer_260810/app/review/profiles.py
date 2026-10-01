from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.rules.loader import load_rule_payload


def normalize_profile_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().casefold()).strip("_")
    return normalized or "technical_manual"


def load_review_profiles(path: Path) -> list[dict[str, Any]]:
    payload = load_rule_payload(path)
    profiles = payload.get("profiles") or {}
    output: list[dict[str, Any]] = []
    for profile_id, item in profiles.items():
        item = item or {}
        normalized_id = normalize_profile_id(str(profile_id))
        output.append(
            {
                "id": normalized_id,
                "name": str(item.get("name") or str(profile_id).replace("_", " ").title()).strip(),
                "enabled_standards": [str(value).strip() for value in item.get("enabled_standards", []) if str(value).strip()],
                "enabled_engines": [str(value).strip() for value in item.get("enabled_engines", []) if str(value).strip()],
                "severity_threshold": str(item.get("severity_threshold") or "minor").strip().casefold(),
                "default": bool(item.get("default", False)),
                "custom": bool(item.get("custom", False)),
            }
        )
    return output


def default_review_profile(path: Path) -> dict[str, Any]:
    profiles = load_review_profiles(path)
    for profile in profiles:
        if profile.get("default"):
            return profile
    return profiles[0] if profiles else {
        "id": "technical_manual",
        "name": "Technical Manual",
        "enabled_standards": ["Microsoft", "IEEE", "NIST"],
        "enabled_engines": ["vale", "team_rule", "glossary"],
        "severity_threshold": "minor",
        "default": True,
        "custom": False,
    }


def resolve_review_profile(
    path: Path,
    profile_id: str | None,
    enabled_standards: list[str] | None,
    enabled_engines: list[str] | None,
    severity_threshold: str | None,
) -> dict[str, Any]:
    profiles = load_review_profiles(path)
    by_id = {profile["id"]: profile for profile in profiles}
    base = dict(by_id.get(normalize_profile_id(profile_id or ""), default_review_profile(path)))
    if enabled_standards is not None:
        base["enabled_standards"] = [str(value).strip() for value in enabled_standards if str(value).strip()]
    if enabled_engines is not None:
        base["enabled_engines"] = [str(value).strip() for value in enabled_engines if str(value).strip()]
    if severity_threshold:
        base["severity_threshold"] = severity_threshold.strip().casefold()
    if profile_id and normalize_profile_id(profile_id) == "custom":
        base["id"] = "custom"
        base["name"] = "Custom"
        base["custom"] = True
    return base

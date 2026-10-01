from __future__ import annotations

from pathlib import Path
from typing import Any

from app.rules.catalog import (
    load_publishing_standard_rules,
    load_team_rules,
    load_vale_rules,
)


def _availability(value: Any) -> str:
    if isinstance(value, dict):
        if value.get("ready") is True or value.get("available") is True:
            return "Ready"
        if value.get("enabled") is False:
            return "Disabled"
        if value.get("installed") is False:
            return "Not Installed"
    if value is True:
        return "Ready"
    if value is False:
        return "Not Ready"
    return "Not available"


def _card(
    *,
    display_name: str,
    internal_id: str,
    engine_type: str,
    main_purpose: str,
    checks: str,
    recommended: str,
    not_recommended: str,
    input_unit: str,
    basis: str,
    dependency: str,
    external_program: str,
    speed: str,
    strength: str,
    limitation: str,
    enabled: bool,
    readiness: str,
    version: str = "Not available",
    rule_count: int | str = "Not available",
    rule_saveable: bool = True,
    memory_included: bool = True,
    configuration: str = "Not available",
) -> dict[str, Any]:
    return {
        "display_name": display_name,
        "internal_id": internal_id,
        "engine_type": engine_type,
        "main_purpose": main_purpose,
        "what_it_checks": checks,
        "recommended_use": recommended,
        "not_recommended_for": not_recommended,
        "input_unit": input_unit,
        "basis": basis,
        "local_dependency": dependency,
        "external_program_required": external_program,
        "expected_review_speed": speed,
        "main_strength": strength,
        "main_limitation": limitation,
        "current_enabled_state": "Enabled" if enabled else "Disabled",
        "current_readiness": readiness,
        "current_version_or_model": version,
        "rule_count": rule_count,
        "result_can_be_saved_as_rule": rule_saveable,
        "included_in_review_memory": memory_included,
        "configuration_source": configuration,
    }


def build_engine_info(
    *,
    standards_dir: Path,
    team_rules_path: Path,
    vale_styles_dir: Path,
    profile: dict[str, Any],
    statuses: dict[str, Any] | None = None,
    ollama_model: str = "Not available",
    languagetool_enabled: bool = False,
) -> dict[str, Any]:
    statuses = statuses or {}
    enabled_engines = set(profile.get("enabled_engines") or [])
    enabled_standards = set(profile.get("enabled_standards") or [])
    team_rules = load_team_rules(team_rules_path)
    vale_rules = load_vale_rules(vale_styles_dir)
    standard_rules = load_publishing_standard_rules(standards_dir)

    ollama_status = statuses.get("ollama") or {}
    ollama_ready = "Ready" if ollama_status.get("model_installed") else _availability(ollama_status.get("reachable"))
    vale_ready = _availability(statuses.get("vale"))

    engines = [
        _card(
            display_name="Vale",
            internal_id="vale",
            engine_type="Local style linter",
            main_purpose="Style, term, unit, warning, caption, and procedure checks",
            checks="Vale style files under TeamManual.",
            recommended="Technical style consistency checks.",
            not_recommended="Contextual sentence rewrites.",
            input_unit="Text block",
            basis="Rule-based",
            dependency="Vale binary and local style files",
            external_program="Yes",
            speed="Fast",
            strength="Configurable local style rules",
            limitation="Rule metadata depends on Vale style file content.",
            enabled="vale" in enabled_engines,
            readiness=vale_ready,
            rule_count=len(vale_rules),
            configuration="config/vale",
        ),
        _card(
            display_name="Team Rule Engine",
            internal_id="team_rule",
            engine_type="YAML regex/literal rule engine",
            main_purpose="Team manual rules and promoted rules",
            checks="Team-defined wording, format, unit, and consistency rules.",
            recommended="Team-specific deterministic checks.",
            not_recommended="Broad grammar review.",
            input_unit="Text block",
            basis="Rule-based",
            dependency="config/team_standard/rules.yaml",
            external_program="No",
            speed="Fast",
            strength="Stable local rules and workflow integration",
            limitation="Coverage is limited to configured rules.",
            enabled="team_rule" in enabled_engines,
            readiness="Ready" if team_rules_path.exists() else "Configuration Error",
            rule_count=len(team_rules),
            configuration="config/team_standard/rules.yaml",
        ),
        _card(
            display_name="Glossary",
            internal_id="glossary",
            engine_type="SQLite glossary matcher",
            main_purpose="Terminology consistency",
            checks="Project, common, and scoped glossary terms.",
            recommended="Preferred/protected terminology checks.",
            not_recommended="General grammar or style rewrites.",
            input_unit="Text block",
            basis="Rule-based",
            dependency="data/reviewer.db glossary_terms",
            external_program="No",
            speed="Fast",
            strength="Project-specific terminology",
            limitation="Depends on stored glossary coverage.",
            enabled="glossary" in enabled_engines,
            readiness="Ready",
            configuration="data/reviewer.db:glossary_terms",
        ),
        _card(
            display_name="Basic Rules",
            internal_id="basic",
            engine_type="Code-defined local rules",
            main_purpose="Baseline typo and formatting checks",
            checks="Built-in fixed rules such as unit spacing and notation.",
            recommended="Part Review and baseline deterministic checks.",
            not_recommended="Organization-specific rules that need YAML editing.",
            input_unit="Text block",
            basis="Rule-based",
            dependency="Application code",
            external_program="No",
            speed="Fast",
            strength="Always available when the app runs",
            limitation="Rules require code changes.",
            enabled="basic" in enabled_engines or True,
            readiness="Ready",
            configuration="app/main.py",
        ),
        _card(
            display_name="Ollama",
            internal_id="ollama",
            engine_type="Local AI context engine",
            main_purpose="Context and technical sentence review",
            checks="Contextual wording and sentence-level issues.",
            recommended="Full Review contextual checks when local model is approved.",
            not_recommended="Rule inventory or deterministic rule catalog reporting.",
            input_unit="Review block",
            basis="AI-based",
            dependency="Ollama local server and approved model",
            external_program="Yes",
            speed="Slow",
            strength="Context-aware review",
            limitation="No fixed rule catalog; findings are AI Context Findings.",
            enabled="ollama" in enabled_engines,
            readiness=ollama_ready,
            version=ollama_model,
            rule_count=0,
            rule_saveable=True,
            memory_included=False,
            configuration="OLLAMA_URL / OLLAMA_MODEL",
        ),
        _card(
            display_name="Publishing Standards Rule Engine",
            internal_id="publishing_standard",
            engine_type="Publishing standard YAML rule engine",
            main_purpose="Checks against selected publishing standards",
            checks="Standard-specific rules from AMS, IEEE, Microsoft, and NIST folders.",
            recommended="Standards-driven review.",
            not_recommended="AI context review.",
            input_unit="Text block",
            basis="Rule-based",
            dependency="config/standards",
            external_program="No",
            speed="Fast",
            strength="Standards are separated and selectable",
            limitation="Only configured YAML rules are available.",
            enabled=bool(enabled_standards),
            readiness="Ready" if standards_dir.exists() else "Configuration Error",
            rule_count=len(standard_rules),
            configuration="config/standards",
        ),
    ]
    if languagetool_enabled:
        language_ready = _availability((statuses.get("languagetool") or {}).get("ready"))
        engines.insert(
            0,
            _card(
                display_name="LanguageTool",
                internal_id="languagetool",
                engine_type="Local grammar engine",
                main_purpose="Grammar and spelling review",
                checks="Grammar, spelling, and LanguageTool rule matches observed during review.",
                recommended="Full Review grammar and spelling checks.",
                not_recommended="Offline Part Review when LanguageTool server is not running.",
                input_unit="Text block",
                basis="Rule-based",
                dependency="Local LanguageTool server",
                external_program="Yes",
                speed="Medium",
                strength="Broad grammar coverage",
                limitation="Full rule catalog is not loaded by this application.",
                enabled="languagetool" in enabled_engines,
                readiness=language_ready,
                configuration="LANGUAGETOOL_URL / config/languagetool",
            ),
        )

    standard_cards: list[dict[str, Any]] = []
    external_standard_ids = {"microsoft", "ieee", "ams", "nist"}
    for standard_dir in sorted(path for path in standards_dir.iterdir() if path.is_dir()) if standards_dir.exists() else []:
        if standard_dir.name.casefold() not in external_standard_ids:
            continue
        rules = [rule for rule in standard_rules if rule.get("configuration_source", "").startswith(f"config/standards/{standard_dir.name}/")]
        enabled = [rule for rule in rules if rule.get("enabled")]
        standard_cards.append({
            "display_name": rules[0].get("standard_name") if rules else standard_dir.name,
            "internal_id": standard_dir.name,
            "engine_type": "Publishing standard",
            "rule_count": len(rules),
            "enabled_rule_count": len(enabled),
            "disabled_rule_count": len(rules) - len(enabled),
            "configuration_source": f"config/standards/{standard_dir.name}",
            "main_purpose": "Publishing style and technical writing checks",
            "current_selected_state": "Selected" if standard_dir.name in enabled_standards else "Not selected",
            "current_readiness": "Ready" if rules else "Configuration Error",
        })

    return {"engines": engines, "standards": standard_cards}

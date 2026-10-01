from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


BASE_DIR = Path(__file__).resolve().parents[2]
TEAM_STANDARD_DIR = BASE_DIR / "config" / "team_standard"
CHICAGO_PILOT_RULES_PATH = TEAM_STANDARD_DIR / "chicago_pilot_rules.yaml"
CHICAGO_PILOT_RULES_BATCH2_PATH = TEAM_STANDARD_DIR / "chicago_pilot_rules_batch2.yaml"

BATCH1_RULE_KEYS = {
    "use_single_space_after_sentence_punctuation",
    "use_serial_comma_in_simple_series",
    "comma_after_introductory_dependent_clause",
    "avoid_comma_splice",
    "capitalize_complete_sentence_after_colon",
    "spell_out_number_at_sentence_start",
    "use_leading_zero_before_decimal",
    "define_abbreviation_at_first_use",
    "place_periods_and_commas_inside_closing_quotes",
    "use_consistent_vertical_list_punctuation",
    "hyphenate_compound_modifier_before_noun",
    "do_not_hyphenate_ly_adverb_compound",
    "use_suspended_hyphen_in_shared_compounds",
    "use_consistent_compound_form",
    "use_approved_ui_term_capitalization",
    "ensure_subject_verb_agreement",
    "ensure_pronoun_antecedent_agreement",
    "avoid_dangling_participial_phrase",
    "maintain_consistent_verb_tense",
    "use_parallel_verb_forms_in_procedural_lists",
}

BATCH2_RULE_KEYS = {
    "remove_space_before_question_or_exclamation_mark",
    "use_comma_before_coordinating_conjunction_between_independent_clauses",
    "avoid_comma_between_compound_predicate_verbs",
    "use_comma_between_coordinate_adjectives",
    "use_period_for_indirect_questions",
    "use_percent_symbol_in_technical_measurements",
    "use_lowercase_periods_for_am_pm",
    "avoid_ambiguous_noon_midnight_time",
    "repeat_ordinal_ending_in_ranges",
    "avoid_apostrophe_for_plural_numbers_and_abbreviations",
    "avoid_hyphen_in_or_so_approximation",
    "avoid_hyphen_in_and_a_half_measurement",
    "avoid_casual_slash_abbreviations",
    "avoid_all_caps_for_emphasis",
    "use_chicago_singular_possessive_s",
    "use_that_for_restrictive_relative_clauses",
    "avoid_double_negative",
    "keep_neither_nor_parallel",
    "keep_auxiliary_verb_forms_parallel",
    "use_singular_verb_after_one_in_ratio",
}

READY_CHICAGO_RULE_KEYS = BATCH1_RULE_KEYS | BATCH2_RULE_KEYS
HIGH_CONFIDENCE_CHICAGO_RULE_KEYS = {
    "use_single_space_after_sentence_punctuation",
    "use_serial_comma_in_simple_series",
    "spell_out_number_at_sentence_start",
    "use_leading_zero_before_decimal",
    "place_periods_and_commas_inside_closing_quotes",
    "use_consistent_vertical_list_punctuation",
    "do_not_hyphenate_ly_adverb_compound",
    "use_approved_ui_term_capitalization",
}
HIGH_CONFIDENCE_CHICAGO_BATCH2_RULE_KEYS = {
    "remove_space_before_question_or_exclamation_mark",
    "avoid_comma_between_compound_predicate_verbs",
    "use_period_for_indirect_questions",
    "use_percent_symbol_in_technical_measurements",
    "use_lowercase_periods_for_am_pm",
    "avoid_ambiguous_noon_midnight_time",
    "repeat_ordinal_ending_in_ranges",
    "avoid_apostrophe_for_plural_numbers_and_abbreviations",
    "avoid_hyphen_in_or_so_approximation",
    "avoid_hyphen_in_and_a_half_measurement",
    "avoid_casual_slash_abbreviations",
    "avoid_all_caps_for_emphasis",
    "avoid_double_negative",
    "use_singular_verb_after_one_in_ratio",
}
HIGH_CONFIDENCE_ALL_CHICAGO_RULE_KEYS = HIGH_CONFIDENCE_CHICAGO_RULE_KEYS | HIGH_CONFIDENCE_CHICAGO_BATCH2_RULE_KEYS


def _metadata(rule: dict[str, Any]) -> dict[str, Any]:
    try:
        value = json.loads(str(rule.get("draft_json") or "{}"))
    except json.JSONDecodeError:
        value = {}
    return value if isinstance(value, dict) else {}


def _config(rule: dict[str, Any]) -> dict[str, Any]:
    config = _metadata(rule).get("matcher_config") or {}
    return config if isinstance(config, dict) else {}


def _reference(rule: dict[str, Any]) -> str:
    metadata = _metadata(rule)
    section = str(metadata.get("source_section") or "").strip()
    if section:
        return f"Chicago Manual of Style, 18th ed., {section}"
    return str(rule.get("source_path") or "Chicago Manual of Style, 18th ed.")


def _examples(rule: dict[str, Any]) -> tuple[str, str]:
    metadata = _metadata(rule)
    positive = metadata.get("positive_examples") or []
    negative = metadata.get("negative_examples") or []
    bad = str(positive[0]) if isinstance(positive, list) and positive else ""
    good = str(negative[0]) if isinstance(negative, list) and negative else ""
    return bad, good


def _issue(
    rule: dict[str, Any],
    source_text: str,
    replacement: str,
    offset: int,
    *,
    confidence: float = 0.92,
) -> dict[str, Any]:
    rule_key = str(rule.get("rule_key") or "")
    title = str(rule.get("title") or rule.get("display_name") or rule_key)
    message = str(rule.get("message") or title)
    bad_example, good_example = _examples(rule)
    return {
        "source_text": source_text,
        "matched_text": source_text,
        "replacement": replacement,
        "suggested_text": replacement,
        "category": str(rule.get("category") or "consistency"),
        "level": "correction",
        "severity": str(rule.get("severity") or "suggestion"),
        "confidence": confidence,
        "explanation_en": message,
        "explanation_ko": "Chicago Manual of Style 파일럿 규칙에 따른 Team Manual Standard 제안입니다.",
        "rule_reference": rule_key,
        "rule_id": rule_key,
        "rule_key": rule_key,
        "engine": "team_rule",
        "rule_source": "Team Manual Standard",
        "standard": "Team Manual Standard",
        "rule_category": str(rule.get("category") or "consistency"),
        "source": _reference(rule),
        "reference": _reference(rule),
        "rationale": str(rule.get("description") or message),
        "message": title,
        "suggestion": str(rule.get("replacement") or replacement),
        "bad_example": bad_example,
        "good_example": good_example,
        "profile": "",
        "offset": offset,
        "start": offset,
        "end": offset + len(source_text),
        "page": None,
        "block": None,
        "exception_reason": "",
        "sources": ["Team Manual Standard"],
    }


def _regex_issues(
    text: str,
    rule: dict[str, Any],
    pattern: str,
    replacement: str | Callable[[re.Match[str]], str],
    *,
    flags: int = 0,
    confidence: float = 0.92,
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for match in re.finditer(pattern, text, flags):
        repl = replacement(match) if callable(replacement) else replacement
        issues.append(_issue(rule, match.group(0), repl, match.start(), confidence=confidence))
    return issues


def _list_lines(text: str) -> list[tuple[int, str, str]]:
    lines: list[tuple[int, str, str]] = []
    offset = 0
    for line in text.splitlines(True):
        clean = line.rstrip("\r\n")
        match = re.match(r"\s*(?:[-*]|\d+[.)])\s+(.+)$", clean)
        if match:
            lines.append((offset, clean, match.group(1).strip()))
        offset += len(line)
    return lines


def check_single_space_after_sentence_punctuation(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"(?<!\.)[.!?] {2,}(?=[A-Z0-9\"])", lambda m: m.group(0)[0] + " ")


def check_serial_comma_in_simple_series(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b([A-Za-z][A-Za-z -]{1,35}), ([a-z][A-Za-z -]{1,35}) (and|or) ([a-z][A-Za-z -]{1,35})(?=[.;,\n]|$)"
    return _regex_issues(text, rule, pattern, lambda m: f"{m.group(1)}, {m.group(2)}, {m.group(3)} {m.group(4)}")


def check_introductory_dependent_clause(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    starters = "After|Before|When|If|Although|Because|Once|While"
    verbs = "select|press|choose|open|close|start|restart|turn|connect|disconnect|save"
    pattern = rf"\b(?:{starters}) [^,.!?\n]{{8,80}} (?=(?:{verbs})\b)"
    return _regex_issues(text, rule, pattern, lambda m: m.group(0).rstrip() + ", ")


def check_comma_splice(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b[A-Z][^.!?\n]{8,60}, (?!and\b|or\b|but\b|nor\b|for\b|so\b|yet\b)the [a-z][^.!?\n]{8,60}\."
    return _regex_issues(text, rule, pattern, lambda m: m.group(0).replace(", ", ". ", 1), confidence=0.82)


def check_capitalize_after_colon(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b(?:Note|Warning|Caution): [a-z][^.!?\n]{8,}[.!?]"

    def repl(match: re.Match[str]) -> str:
        prefix, rest = match.group(0).split(": ", 1)
        return f"{prefix}: {rest[:1].upper()}{rest[1:]}"

    return _regex_issues(text, rule, pattern, repl)


def check_number_at_sentence_start(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for match in re.finditer(r"(?:(?<=^)|(?<=[.!?]\s))(?P<number>\d+)(?=\s+[A-Za-z])", text):
        line_start = text.rfind("\n", 0, match.start()) + 1
        if re.match(r"\s*\d+\.\s", text[line_start : match.start() + 3]):
            continue
        issues.append(_issue(rule, match.group("number"), "Spell out the number or revise the sentence.", match.start()))
    return issues


def check_leading_zero_before_decimal(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"(?<![\w\d])\.(\d+)\b", lambda m: f"0.{m.group(1)}")


def check_abbreviation_first_use(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    approved = {str(item) for item in _config(rule).get("approved_abbreviations", [])}
    for match in re.finditer(r"\b[A-Z]{2,6}s?\b", text):
        abbr = match.group(0).rstrip("s")
        if abbr in approved:
            continue
        if re.search(rf"\([ ]*{re.escape(match.group(0))}[ ]*\)", text[: match.end() + 1]):
            continue
        return [_issue(rule, match.group(0), str(rule.get("replacement") or "Define the abbreviation at first use."), match.start(), confidence=0.8)]
    return []


def check_punctuation_with_closing_quotes(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r'"([^"\n]{1,40})"([,.])', lambda m: f'"{m.group(1)}{m.group(2)}"', confidence=0.84)


def check_vertical_list_punctuation(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    lines = _list_lines(text)
    if len(lines) < 3 or any(item.endswith(":") for _, _, item in lines):
        return []
    terminal = [bool(re.search(r"[.!?]$", item)) for _, _, item in lines]
    if len(set(terminal)) > 1:
        return [_issue(rule, "\n".join(line for _, line, _ in lines), str(rule.get("replacement") or "Apply one consistent list style."), lines[0][0])]
    capitals = [bool(item[:1].isupper()) for _, _, item in lines if item]
    if len(set(capitals)) > 1:
        return [_issue(rule, "\n".join(line for _, line, _ in lines), str(rule.get("replacement") or "Apply one consistent list style."), lines[0][0])]
    return []


def check_compound_modifier_before_noun(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = _config(rule).get("compound_modifier_candidates") or {}
    issues: list[dict[str, Any]] = []
    for open_form, hyphenated in candidates.items():
        pattern = rf"\b{re.escape(str(open_form))}\s+(?P<noun>image|signal|mode|setting|value|field|procedure|controller)\b"
        issues.extend(_regex_issues(text, rule, pattern, lambda m, h=hyphenated: f"{h} {m.group('noun')}", flags=re.IGNORECASE, confidence=0.78))
    return issues


def check_ly_adverb_hyphenation(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    adverbs = "|".join(re.escape(str(item)) for item in (_config(rule).get("safe_adverbs") or [])) or r"[A-Za-z]+ly"
    return _regex_issues(text, rule, rf"\b({adverbs})-([A-Za-z]+)\b", lambda m: f"{m.group(1)} {m.group(2)}", flags=re.IGNORECASE)


def check_suspended_hyphen(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b(low|medium|mid|high|short|long) and ((?:low|medium|mid|high|short|long)-[A-Za-z]+)\b"
    return _regex_issues(text, rule, pattern, lambda m: f"{m.group(1)}- and {m.group(2)}", flags=re.IGNORECASE, confidence=0.82)


def check_consistent_compound_form(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    groups = _config(rule).get("compound_variant_groups") or []
    issues: list[dict[str, Any]] = []
    for group in groups:
        preferred = str(group.get("preferred") or "")
        variants = [str(item) for item in group.get("variants") or []]
        if not preferred or not re.search(rf"\b{re.escape(preferred)}\b", text, re.IGNORECASE):
            continue
        for variant in variants:
            match = re.search(rf"\b{re.escape(variant)}\b", text, re.IGNORECASE)
            if match:
                return [_issue(rule, match.group(0), preferred, match.start(), confidence=0.86)]
    return issues


def check_approved_ui_term_capitalization(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    terms = _config(rule).get("approved_ui_terms") or {}
    issues: list[dict[str, Any]] = []
    for approved, variants in terms.items():
        for variant in variants or []:
            issues.extend(_regex_issues(text, rule, rf"\b{re.escape(str(variant))}\b", str(approved)))
    return issues


def check_subject_verb_agreement(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\b(scan results|test results|measurements) is\b", lambda m: f"{m.group(1)} are", flags=re.IGNORECASE, confidence=0.76)


def check_pronoun_antecedent_agreement(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\b(modules|sensors|controllers) store its\b", lambda m: f"{m.group(1)} store their", flags=re.IGNORECASE, confidence=0.76)


def check_dangling_participial_phrase(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\bAfter completing the scan, the result window appears\.", "After completing the scan, the user sees the result window.", confidence=0.74)


def check_consistent_verb_tense(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\bstarts ([^.!?\n]{1,60}) and displayed\b", lambda m: m.group(0).replace("displayed", "displays"), flags=re.IGNORECASE, confidence=0.74)


def check_parallel_procedural_list_verbs(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    lines = _list_lines(text)
    if len(lines) < 3 or any(":" in item for _, _, item in lines):
        return []
    passive = [line for line in lines if re.match(r"The [A-Za-z ]+ is \w+", line[2])]
    if passive:
        return [_issue(rule, passive[0][1], str(rule.get("replacement") or "Begin each step with a parallel imperative verb form."), passive[0][0], confidence=0.78)]
    return []


def check_space_before_question_or_exclamation(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"(?<=[A-Za-z0-9\)])\s+([?!])", lambda m: m.group(1), confidence=0.96)


def check_comma_before_independent_clause_conjunction(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    verbs = r"is|are|was|were|starts|stops|opens|appears|fails|passes|updates|runs|responds|turns|remains"
    pattern = rf"\b(?:The|This|That|A|An)\s+[^,.!?\n]{{2,70}}\b(?:{verbs})\b[^,.!?\n]{{0,40}}\s+(?:and|but|or)\s+(?:the|this|that|a|an)\s+[^.!?\n]{{2,70}}\b(?:{verbs})\b[^.!?\n]*[.!?]"
    return _regex_issues(text, rule, pattern, "Insert a comma before the coordinating conjunction.", flags=re.IGNORECASE, confidence=0.72)


def check_compound_predicate_comma(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    verbs = "Press|Select|Open|Close|Start|Restart|Save|Connect|Disconnect|Install|Remove|Load|Run"
    pattern = rf"\b({verbs}) ([^.!?\n]{{1,60}}),\s+and ({verbs.lower()})\b"
    return _regex_issues(text, rule, pattern, lambda m: f"{m.group(1)} {m.group(2)} and {m.group(3)}", flags=re.IGNORECASE)


def check_coordinate_adjective_comma(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pairs = {
        ("clean", "dry"),
        ("long", "narrow"),
        ("small", "removable"),
        ("secure", "stable"),
        ("clear", "accurate"),
    }
    issues: list[dict[str, Any]] = []
    pattern = r"\b(clean|long|small|secure|clear) (dry|narrow|removable|stable|accurate) (cloth|slot|cover|surface|workspace|housing|reading)\b"
    for match in re.finditer(pattern, text, re.IGNORECASE):
        if (match.group(1).casefold(), match.group(2).casefold()) not in pairs:
            continue
        issues.append(_issue(rule, match.group(0), f"{match.group(1)}, {match.group(2)} {match.group(3)}", match.start(), confidence=0.78))
    return issues


def check_indirect_question_period(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b(?:Confirm|Check|Verify|Determine|Review) (?:whether|if) [^.!?\n]{3,90}\s*\?"
    return _regex_issues(text, rule, pattern, lambda m: m.group(0)[:-1] + ".", confidence=0.9)


def check_percent_symbol(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\b(\d+(?:\.\d+)?) percent\b", lambda m: f"{m.group(1)}%", flags=re.IGNORECASE)


def check_am_pm_style(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b(\d{1,2}(?::\d{2})?)\s*(AM|PM|A\.M\.|P\.M\.|am|pm)(?=\W|$)"

    def repl(match: re.Match[str]) -> str:
        marker = "a.m." if match.group(2).lower().startswith("a") else "p.m."
        return f"{match.group(1)} {marker}"

    return _regex_issues(text, rule, pattern, repl)


def check_ambiguous_noon_midnight(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b12:00\s*(?:a\.m\.|p\.m\.|AM|PM|A\.M\.|P\.M\.)(?=\W|$)"
    return _regex_issues(text, rule, pattern, "Use noon or midnight if that is the intended time.", flags=re.IGNORECASE)


def check_ordinal_range_endings(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\b(\d+)\s*[-\u2013]\s*(\d+)(st|nd|rd|th)\b", "Repeat the ordinal ending on both numbers in the range.", confidence=0.9)


def check_apostrophe_plural_numbers_abbreviations(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\b([A-Z]{2,6}|\d{2,4})'s\b", lambda m: f"{m.group(1)}s")


def check_or_so_hyphen(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    number = "one|two|three|four|five|six|seven|eight|nine|ten|\\d+"
    return _regex_issues(text, rule, rf"\b({number})-or-so\b", lambda m: f"{m.group(1)} or so", flags=re.IGNORECASE)


def check_and_a_half_hyphen(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    number = "one|two|three|four|five|six|seven|eight|nine|ten|\\d+"
    pattern = rf"\b({number})-and-a-half(?=\s+(?:hours|minutes|days|seconds|turns|cycles)\b)"
    return _regex_issues(text, rule, pattern, lambda m: f"{m.group(1)} and a half", flags=re.IGNORECASE)


def check_casual_slash_abbreviations(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for pattern, replacement in ((r"\bw/(?=\s)", "with"), (r"\bw/o(?=\s)", "without")):
        issues.extend(_regex_issues(text, rule, pattern, replacement, flags=re.IGNORECASE))
    return issues


def check_all_caps_emphasis(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b(VERY|NEVER|ALWAYS|IMPORTANT)\b"
    return _regex_issues(text, rule, pattern, lambda m: m.group(1).lower(), confidence=0.86)


def check_singular_possessive_s(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    return _regex_issues(text, rule, r"\b([A-Z][a-z]+s)'\s+(?=(?:manual|controller|sensor|port|setting|procedure)\b)", lambda m: f"{m.group(1)}'s ", confidence=0.78)


def check_restrictive_which(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    nouns = "module|device|controller|sensor|file|setting|procedure|option|button|port"
    verbs = "controls|contains|stores|opens|starts|fails|matches|connects|displays"
    pattern = rf"\b(the|a)\s+({nouns})\s+which\s+({verbs})\b"
    return _regex_issues(text, rule, pattern, lambda m: f"{m.group(1)} {m.group(2)} that {m.group(3)}", flags=re.IGNORECASE, confidence=0.76)


def check_double_negative(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b(?:do not|does not|did not|cannot|can't) [^.!?\n]{0,35}\b(no|never|nothing|none)\b"
    return _regex_issues(text, rule, pattern, "Use a single negative construction.", flags=re.IGNORECASE)


def check_neither_nor_parallel(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\bneither\s+(records|opens|starts|saves|loads|checks)\s+[^.!?\n]{1,45}\s+nor\s+the\s+[a-z]+\s+(?:appears|opens|starts|is|are|loads)\b"
    return _regex_issues(text, rule, pattern, "Make the words after neither and nor grammatically parallel.", flags=re.IGNORECASE, confidence=0.74)


def check_auxiliary_parallel(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    verbs = "starts|records|loads|opens|saves|checks"
    pattern = rf"\b(?:{verbs})\s+[^.!?\n]{{1,45}},\s+(?:{verbs})\s+[^.!?\n]{{1,45}},\s+and\s+is\s+[a-z]+ing\b"
    return _regex_issues(text, rule, pattern, "Use parallel verb forms in the series.", flags=re.IGNORECASE, confidence=0.74)


def check_one_in_ratio_singular(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    pattern = r"\b((?:Only|Approximately|About)\s+)?1\s+in\s+(\d+)\s+(modules|units|devices|sensors|controllers)\s+have\b"
    return _regex_issues(text, rule, pattern, lambda m: f"{m.group(1) or ''}1 in {m.group(2)} {m.group(3)} has", flags=re.IGNORECASE)


TEAM_STANDARD_MATCHERS: dict[str, Callable[[str, dict[str, Any]], list[dict[str, Any]]]] = {
    "use_single_space_after_sentence_punctuation": check_single_space_after_sentence_punctuation,
    "use_serial_comma_in_simple_series": check_serial_comma_in_simple_series,
    "comma_after_introductory_dependent_clause": check_introductory_dependent_clause,
    "avoid_comma_splice": check_comma_splice,
    "capitalize_complete_sentence_after_colon": check_capitalize_after_colon,
    "spell_out_number_at_sentence_start": check_number_at_sentence_start,
    "use_leading_zero_before_decimal": check_leading_zero_before_decimal,
    "define_abbreviation_at_first_use": check_abbreviation_first_use,
    "place_periods_and_commas_inside_closing_quotes": check_punctuation_with_closing_quotes,
    "use_consistent_vertical_list_punctuation": check_vertical_list_punctuation,
    "hyphenate_compound_modifier_before_noun": check_compound_modifier_before_noun,
    "do_not_hyphenate_ly_adverb_compound": check_ly_adverb_hyphenation,
    "use_suspended_hyphen_in_shared_compounds": check_suspended_hyphen,
    "use_consistent_compound_form": check_consistent_compound_form,
    "use_approved_ui_term_capitalization": check_approved_ui_term_capitalization,
    "ensure_subject_verb_agreement": check_subject_verb_agreement,
    "ensure_pronoun_antecedent_agreement": check_pronoun_antecedent_agreement,
    "avoid_dangling_participial_phrase": check_dangling_participial_phrase,
    "maintain_consistent_verb_tense": check_consistent_verb_tense,
    "use_parallel_verb_forms_in_procedural_lists": check_parallel_procedural_list_verbs,
    "remove_space_before_question_or_exclamation_mark": check_space_before_question_or_exclamation,
    "use_comma_before_coordinating_conjunction_between_independent_clauses": check_comma_before_independent_clause_conjunction,
    "avoid_comma_between_compound_predicate_verbs": check_compound_predicate_comma,
    "use_comma_between_coordinate_adjectives": check_coordinate_adjective_comma,
    "use_period_for_indirect_questions": check_indirect_question_period,
    "use_percent_symbol_in_technical_measurements": check_percent_symbol,
    "use_lowercase_periods_for_am_pm": check_am_pm_style,
    "avoid_ambiguous_noon_midnight_time": check_ambiguous_noon_midnight,
    "repeat_ordinal_ending_in_ranges": check_ordinal_range_endings,
    "avoid_apostrophe_for_plural_numbers_and_abbreviations": check_apostrophe_plural_numbers_abbreviations,
    "avoid_hyphen_in_or_so_approximation": check_or_so_hyphen,
    "avoid_hyphen_in_and_a_half_measurement": check_and_a_half_hyphen,
    "avoid_casual_slash_abbreviations": check_casual_slash_abbreviations,
    "avoid_all_caps_for_emphasis": check_all_caps_emphasis,
    "use_chicago_singular_possessive_s": check_singular_possessive_s,
    "use_that_for_restrictive_relative_clauses": check_restrictive_which,
    "avoid_double_negative": check_double_negative,
    "keep_neither_nor_parallel": check_neither_nor_parallel,
    "keep_auxiliary_verb_forms_parallel": check_auxiliary_parallel,
    "use_singular_verb_after_one_in_ratio": check_one_in_ratio_singular,
}


def audit_chicago_matcher_failure(rule_key: str, detail: str) -> None:
    log_path = BASE_DIR / "data" / "logs" / "audit.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": "TEAM_STANDARD_MATCHER_FAILED",
        "document_id": "",
        "project": "",
        "status": "FAILED",
        "detail": f"{rule_key}: {detail}"[:240],
    }
    with log_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def run_chicago_matcher(text: str, rule: dict[str, Any]) -> list[dict[str, Any]]:
    rule_key = str(rule.get("rule_key") or "")
    matcher = TEAM_STANDARD_MATCHERS.get(rule_key)
    if matcher is None:
        raise KeyError(f"No Team Manual Standard matcher registered for enabled rule {rule_key!r}.")
    try:
        return matcher(text, rule)
    except Exception as exc:
        audit_chicago_matcher_failure(rule_key, type(exc).__name__)
        return []

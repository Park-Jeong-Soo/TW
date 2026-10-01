import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import fitz

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_tests_{os.getpid()}.db"),
)

from app.main import (
    ENGINE_COOLDOWN_UNTIL,
    build_json_export,
    classify_block_role,
    check_basic_rules,
    check_languagetool,
    find_preferred_term_issues,
    extract_blocks,
    is_sentence_like,
    normalize_issue_anchor,
    request_ollama,
    run_context_review_for_role,
    run_languagetool_for_role,
    standards_for_role,
)


class BasicRuleTests(unittest.TestCase):
    def findings(self, text):
        return {
            (item["source_text"], item["replacement"], item["category"])
            for item in check_basic_rules(text, [])
        }

    def test_basic_rules_only_apply_safe_format_not_grammar(self):
        findings = self.findings(
            "The scan rate are set to 20mm/s during high-speed measurement."
        )
        self.assertNotIn(("are", "is", "grammar"), findings)
        self.assertIn(("20mm/s", "20 mm/s", "consistency"), findings)

    def test_uncertain_subject_verb_regex_is_disabled(self):
        self.assertNotIn(
            ("have", "has", "grammar"),
            self.findings("The system have two scanners."),
        )

    def test_complex_plural_subject_is_not_changed(self):
        findings = self.findings(
            "The main factors slowing the speed of the AFM are the XYZ Scanner's "
            "response rate and the response rate of the circuit."
        )
        self.assertNotIn(("are", "is", "grammar"), findings)

    def test_range_and_project_term(self):
        text = "The scan speed was increased 2 mm/s->20mm/s."
        findings = self.findings(text)
        self.assertIn(
            ("2 mm/s->20mm/s", "from 2 mm/s to 20 mm/s", "consistency"),
            findings,
        )
        dictionary = [
            {
                "term": "scan speed",
                "preferred_term": "scan rate",
                "kind": "preferred",
            }
        ]
        term_findings = find_preferred_term_issues(text, dictionary)
        self.assertEqual(term_findings[0]["replacement"], "scan rate")

    def test_general_whitespace_and_punctuation_spacing_are_excluded(self):
        findings = self.findings("the system is ready ,but  wait!!")
        self.assertEqual(findings, set())

    def test_symbol_range_style(self):
        findings = {
            (item["source_text"], item["replacement"])
            for item in check_basic_rules(
                "Set 2mm/s->20mm/s.",
                [],
                {"unit_spacing": True, "arrow_style": "symbol"},
            )
        }
        self.assertIn(("2mm/s->20mm/s", "2 mm/s → 20 mm/s"), findings)

    def test_figure_title_case_is_fixed_and_tm_is_preserved(self):
        text = "Figure 2.1 response of the scanner with SmartScan TM"
        findings = check_basic_rules(text, [], role="caption")
        issue = next(item for item in findings if item["rule_reference"] == "fixed_figure_title_case")
        self.assertEqual(issue["replacement"], "Response of the Scanner with SmartScan TM")
        self.assertEqual(issue["category"], "typo")
        self.assertEqual(issue["severity"], "minor")

    def test_only_chapter_sequence_figure_marker_is_a_caption(self):
        caption = classify_block_role(
            "Figure 2.1 scanner response in contact mode",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=500,
            y1=520,
            page_height=800,
        )
        body_reference = classify_block_role(
            "Figure 2 shows the scanner response.",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=200,
            y1=220,
            page_height=800,
        )
        body_above_figure = classify_block_role(
            "The signal is measured above the sample.",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=450,
            y1=470,
            page_height=800,
        )
        self.assertEqual(caption, "caption")
        self.assertEqual(body_reference, "body")
        self.assertEqual(body_above_figure, "body")
        self.assertFalse(
            any(
                item["rule_reference"] == "fixed_figure_title_case"
                for item in check_basic_rules(
                    "Figure 2 shows the scanner response.",
                    [],
                    role="body",
                )
            )
        )

    def test_table_of_contents_dot_leader_is_not_reviewable_text(self):
        role = classify_block_role(
            "System Configuration .......... 12",
            font_size=10,
            body_font_size=10,
            bold_ratio=0.0,
            y0=200,
            y1=215,
            page_height=800,
        )
        self.assertEqual(role, "toc")

    def test_structured_block_roles_are_not_treated_as_prose(self):
        table_role = classify_block_role(
            "Scan rate 20mm/s",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=200,
            y1=215,
            page_height=800,
            in_table=True,
        )
        equation_role = classify_block_role(
            "F=kx",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=220,
            y1=235,
            page_height=800,
        )
        spec_role = classify_block_role(
            "Scan rate: 20mm/s",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=240,
            y1=255,
            page_height=800,
        )
        value_role = classify_block_role(
            "20mm/s",
            font_size=9,
            body_font_size=9,
            bold_ratio=0.0,
            y0=260,
            y1=275,
            page_height=800,
        )
        self.assertEqual(table_role, "table_cell")
        self.assertEqual(equation_role, "equation")
        self.assertEqual(spec_role, "spec")
        self.assertEqual(value_role, "value")
        for role in ("table_cell", "equation", "value", "spec"):
            self.assertFalse(run_languagetool_for_role(role))
            self.assertFalse(run_context_review_for_role(role))
        self.assertEqual(standards_for_role(["NIST", "AMS", "Microsoft"], "value"), {"NIST"})
        self.assertEqual(standards_for_role(["NIST", "AMS", "IEEE"], "equation"), {"AMS", "IEEE"})

    def test_title_body_and_sentence_classification(self):
        title = classify_block_role(
            "System Configuration",
            font_size=18,
            body_font_size=10,
            bold_ratio=1.0,
            y0=60,
            y1=82,
            page_height=800,
        )
        body = classify_block_role(
            "The system controls the scanner.",
            font_size=10,
            body_font_size=10,
            bold_ratio=0.0,
            y0=180,
            y1=200,
            page_height=800,
        )
        self.assertEqual(title, "title")
        self.assertEqual(body, "body")
        self.assertFalse(is_sentence_like("System Configuration", title))
        self.assertTrue(is_sentence_like("The system controls the scanner.", body))
        self.assertTrue(is_sentence_like("Select the measurement mode", body))

    def test_pdf_extraction_preserves_title_and_body_roles(self):
        path = Path(tempfile.gettempdir()) / f"review_roles_{os.getpid()}.pdf"
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text((72, 72), "System Configuration", fontsize=20)
        page.insert_text((72, 130), "The system controls the scanner.", fontsize=10)
        pdf.save(path)
        pdf.close()
        try:
            blocks, _pages = extract_blocks(path, 1)
        finally:
            path.unlink(missing_ok=True)
        roles = {block["text"]: block["role"] for block in blocks}
        self.assertEqual(roles["System Configuration"], "title")
        self.assertEqual(roles["The system controls the scanner."], "body")

    def test_short_repeated_issue_anchor_expands_to_unique_context(self):
        text = "Electrostatic Force Microsopy and Kelvin Probe Force Microsopy"
        issue = normalize_issue_anchor(
            text,
            {"source_text": "Microsopy", "replacement": "Microscopy"},
            text.index("Microsopy"),
        )
        self.assertGreaterEqual(len(issue["source_text"]), 10)
        self.assertLessEqual(len(issue["source_text"]), 40)
        self.assertEqual(text.count(issue["source_text"]), 1)
        self.assertIn("Microscopy", issue["replacement"])

    def test_languagetool_sentence_case_is_typo_but_heading_grammar_is_excluded(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "matches": [
                {
                    "offset": 0,
                    "length": 1,
                    "message": "This sentence does not start with an uppercase letter.",
                    "replacements": [{"value": "T"}],
                    "rule": {
                        "id": "UPPERCASE_SENTENCE_START",
                        "issueType": "typographical",
                        "category": {"id": "CASING"},
                    },
                }
            ]
        }
        ENGINE_COOLDOWN_UNTIL.clear()
        with patch("app.main.requests.post", return_value=response):
            findings = check_languagetool("the system is ready.", "en-US", [])
        self.assertEqual(findings[0]["category"], "typo")
        with patch("app.main.requests.post", return_value=response):
            heading_findings = check_languagetool(
                "system configuration", "en-US", [], role="heading", is_sentence=False
            )
        self.assertEqual(heading_findings, [])

    def test_languagetool_whitespace_only_suggestion_is_excluded(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "matches": [
                {
                    "offset": 19,
                    "length": 2,
                    "message": "Remove whitespace before punctuation.",
                    "replacements": [{"value": ","}],
                    "rule": {
                        "id": "COMMA_WHITESPACE",
                        "issueType": "typographical",
                        "category": {"id": "PUNCTUATION"},
                    },
                }
            ]
        }
        ENGINE_COOLDOWN_UNTIL.clear()
        with patch("app.main.requests.post", return_value=response):
            findings = check_languagetool("The system is ready ,but wait.", "en-US", [])
        self.assertEqual(findings, [])

    def test_languagetool_merges_cmos_custom_rules_for_us_english(self):
        base_response = Mock()
        base_response.raise_for_status.return_value = None
        base_response.json.return_value = {"matches": []}
        custom_response = Mock()
        custom_response.raise_for_status.return_value = None
        custom_response.json.return_value = {
            "matches": [
                {
                    "offset": 15,
                    "length": 3,
                    "message": "Chicago style uses a serial comma.",
                    "replacements": [{"value": ", and"}],
                    "rule": {
                        "id": "CMOS_SERIAL_COMMA_SIMPLE",
                        "issueType": "grammar",
                        "category": {"id": "CMOS_TECHNICAL_MANUAL"},
                    },
                }
            ]
        }
        ENGINE_COOLDOWN_UNTIL.clear()
        with patch(
            "app.main.requests.post",
            side_effect=[base_response, custom_response],
        ) as post:
            findings = check_languagetool(
                "Use red, green and blue indicators.", "en-US", []
            )
        self.assertEqual(findings[0]["rule_reference"], "CMOS_SERIAL_COMMA_SIMPLE")
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[1].kwargs["data"]["language"], "en")
        self.assertEqual(post.call_args_list[1].kwargs["data"]["enabledOnly"], "true")

    def test_ollama_drops_heading_grammar_and_receives_context(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "message": {
                "content": json.dumps(
                    {
                        "results": [
                            {
                                "unit_id": "p001-b001",
                                "issues": [
                                    {
                                        "category": "grammar",
                                        "severity": "major",
                                        "confidence": 0.99,
                                        "source_text": "System configuration",
                                        "replacement": "The system configuration",
                                        "comment": "Add an article.",
                                    }
                                ],
                            }
                        ]
                    }
                )
            }
        }
        ENGINE_COOLDOWN_UNTIL.clear()
        with patch("app.main.requests.post", return_value=response) as post:
            findings = request_ollama(
                "System configuration",
                "p001-b001",
                [],
                "qwen2.5:7b",
                role="heading",
                is_sentence=False,
                context_before="Previous paragraph.",
                context_after="The system is ready.",
            )
        self.assertEqual(findings, [])
        prompt = post.call_args.kwargs["json"]["messages"][1]["content"]
        self.assertIn("TARGET ROLE is heading", prompt)
        self.assertIn("PREVIOUS CONTEXT: Previous paragraph.", prompt)

    def test_low_confidence_content_is_rejected(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "message": {
                "content": json.dumps(
                    {
                        "results": [
                            {
                                "unit_id": "p001-b001",
                                "issues": [
                                    {
                                        "category": "content",
                                        "severity": "critical",
                                        "confidence": 0.94,
                                        "source_text": "The system is ready.",
                                        "replacement": "",
                                        "comment": "Possibly unrelated.",
                                    }
                                ],
                            }
                        ]
                    }
                )
            }
        }
        ENGINE_COOLDOWN_UNTIL.clear()
        with patch("app.main.requests.post", return_value=response) as post:
            findings = request_ollama(
                "The system is ready.",
                "p001-b001",
                [],
                "qwen2.5:7b",
                role="body",
                is_sentence=True,
            )
        self.assertEqual(findings, [])
        prompt = post.call_args.kwargs["json"]["messages"][1]["content"]
        self.assertIn("Content is extremely conservative", prompt)


class ExportTests(unittest.TestCase):
    def test_json_export_has_portable_schema(self):
        document = {
            "id": "doc-1",
            "filename": "manual.pdf",
            "project_name": "Demo",
            "reviewer": "Reviewer",
            "page_count": 1,
            "review_status": "completed",
            "created_at": "2026-01-01T00:00:00+00:00",
        }
        payload = json.loads(build_json_export(document, []))
        self.assertEqual(payload["schema_version"], "1.0")
        self.assertNotIn("file_path", payload["document"])
        self.assertEqual(payload["issues"], [])


if __name__ == "__main__":
    unittest.main()

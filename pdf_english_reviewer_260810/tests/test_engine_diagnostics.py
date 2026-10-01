import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_engine_diag_{os.getpid()}.db"),
)

from app.main import ENGINE_COOLDOWN_UNTIL, check_languagetool, request_ollama
from app.review.engine_diagnostics import EngineDiagnostics


class EngineDiagnosticsTests(unittest.TestCase):
    def test_languagetool_diagnostics_count_filtered_matches_without_text(self):
        base_response = Mock()
        base_response.raise_for_status.return_value = None
        base_response.json.return_value = {
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
        custom_response = Mock()
        custom_response.raise_for_status.return_value = None
        custom_response.json.return_value = {"matches": []}
        diagnostics = EngineDiagnostics()

        ENGINE_COOLDOWN_UNTIL.clear()
        source_text = "The system is ready ,but wait."
        with patch("app.main.requests.post", side_effect=[base_response, custom_response]):
            findings = check_languagetool(
                source_text,
                "en-US",
                [],
                diagnostics=diagnostics,
            )

        summary = diagnostics.snapshot()["languagetool"]
        self.assertEqual(findings, [])
        self.assertEqual(summary["requested_units"], 1)
        self.assertEqual(summary["sent_units"], 1)
        self.assertEqual(summary["http_requests"], 2)
        self.assertEqual(summary["raw_findings"], 1)
        self.assertEqual(summary["emitted_findings"], 0)
        self.assertEqual(summary["filtered_findings"], 1)
        self.assertEqual(summary["filter_reasons"]["whitespace_only"], 1)
        self.assertNotIn(source_text, json.dumps(summary))

    def test_ollama_diagnostics_count_raw_accepted_and_filtered_issues(self):
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
                                        "source_text": "scan rate are",
                                        "replacement": "scan rate is",
                                        "comment": "Fix agreement.",
                                    },
                                    {
                                        "category": "content",
                                        "severity": "critical",
                                        "confidence": 0.94,
                                        "source_text": "The scan rate are stable.",
                                        "replacement": "",
                                        "comment": "Too uncertain.",
                                    },
                                ],
                            }
                        ]
                    }
                )
            }
        }
        diagnostics = EngineDiagnostics()

        ENGINE_COOLDOWN_UNTIL.clear()
        source_text = "The scan rate are stable."
        with patch("app.main.requests.post", return_value=response):
            findings = request_ollama(
                source_text,
                "p001-b001",
                [],
                "qwen2.5:7b",
                role="body",
                is_sentence=True,
                diagnostics=diagnostics,
            )

        summary = diagnostics.snapshot()["ollama"]
        self.assertEqual(len(findings), 1)
        self.assertEqual(summary["requested_units"], 1)
        self.assertEqual(summary["sent_units"], 1)
        self.assertEqual(summary["http_requests"], 1)
        self.assertEqual(summary["raw_findings"], 2)
        self.assertEqual(summary["emitted_findings"], 1)
        self.assertEqual(summary["filtered_findings"], 1)
        self.assertEqual(summary["filter_reasons"]["low_confidence"], 1)
        self.assertNotIn(source_text, json.dumps(summary))


if __name__ == "__main__":
    unittest.main()

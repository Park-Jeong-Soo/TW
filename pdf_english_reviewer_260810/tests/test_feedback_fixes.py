from pathlib import Path
import unittest

from app.integrations.vale_client import run_vale_diagnostic, run_vale_text
from app.review.paragraph_reconstruction import reconstruct_review_blocks, join_soft_line_break
from app.review.sentence_segmentation import split_sentences


class FeedbackFixTests(unittest.TestCase):
    def test_wrapped_line_is_single_reconstructed_paragraph(self):
        blocks = [
            {"page": 1, "block_index": 0, "text": "The XY scanner moves the sample to the target", "bbox": [72, 100, 420, 112], "role": "body", "font_size": 10, "reviewable": True},
            {"page": 1, "block_index": 1, "text": "position before the measurement begins.", "bbox": [72, 114, 360, 126], "role": "body", "font_size": 10, "reviewable": True},
        ]
        units = reconstruct_review_blocks(blocks)
        self.assertEqual(len(units), 1)
        self.assertEqual(units[0]["text"], "The XY scanner moves the sample to the target position before the measurement begins.")

    def test_soft_line_break_dehyphenates_conservative_word_break(self):
        self.assertEqual(join_soft_line_break("Start the measure-", "ment."), "Start the measurement.")

    def test_sentence_segmentation_ignores_newline_and_abbreviation(self):
        text = "Use e.g. this option. start the next scan."
        self.assertEqual(split_sentences(text), ["Use e.g. this option.", "start the next scan."])

    def test_vale_detects_team_unit_rule(self):
        issues = run_vale_text("Set the distance to 10mm.", Path.cwd())
        self.assertTrue(any(issue["rule_id"] == "TeamManual.Units" and issue["source_text"] == "10mm" for issue in issues))

    def test_vale_diagnostic_reports_real_alert_count(self):
        diagnostic = run_vale_diagnostic(Path.cwd())
        self.assertTrue(diagnostic["passed"])
        self.assertGreaterEqual(diagnostic["parsed_alert_count"], 1)

    def test_issue_ui_buttons_and_filters_match_feedback_request(self):
        html = Path("app/static/index.html").read_text(encoding="utf-8")
        js = Path("app/static/app_v3.js").read_text(encoding="utf-8")
        self.assertIn('id="category-filter"', html)
        self.assertIn('id="engine-filter"', html)
        self.assertIn('id="standard-filter"', html)
        self.assertNotIn('id="issue-sort"', html)
        self.assertNotIn('id="issue-order"', html)
        self.assertNotIn("Ignore to Rule", js)
        self.assertNotIn("Promote to Rule", js)
        self.assertNotIn("data-ignore-rule-issue", js)
        self.assertNotIn("data-promote-issue", js)
        self.assertIn("Engine Suggestions", Path("app/static/index.html").read_text(encoding="utf-8"))
        self.assertIn("engine_suggestions", js)
        self.assertNotIn("Needs Review", js)
        self.assertNotIn("Ignore once", js)
        self.assertNotIn("Add Exception", js)


if __name__ == "__main__":
    unittest.main()

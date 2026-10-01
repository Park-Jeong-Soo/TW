import unittest

from app.review.evidence import enrich_issue_evidence


class IssueEvidenceTests(unittest.TestCase):
    def test_builtin_rule_gets_evidence(self):
        issue = enrich_issue_evidence({"rule_reference": "basic_number_unit_spacing", "explanation_en": "x"})
        self.assertEqual(issue["rule_id"], "basic_number_unit_spacing")
        self.assertEqual(issue["engine"], "team_rule")
        self.assertTrue(issue["rule_source"])


if __name__ == "__main__":
    unittest.main()

import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_rule_feedback_{os.getpid()}.db"),
)

from app.main import get_rules_status


class RuleFeedbackApiTests(unittest.TestCase):
    def test_rules_status_endpoint(self):
        payload = get_rules_status()
        self.assertIn("rules", payload)
        self.assertIn("team_rules_config", payload)


if __name__ == "__main__":
    unittest.main()

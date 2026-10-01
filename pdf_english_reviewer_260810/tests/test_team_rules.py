from pathlib import Path
import unittest

from app.rules.engine import run_team_standard_rules


class TeamRuleTests(unittest.TestCase):
    def test_unit_space_rule_flags_joined_unit(self):
        issues = run_team_standard_rules("Set the distance to 10mm.", Path("config/team_standard/rules.yaml"))
        self.assertTrue(any(item["rule_id"] == "UNIT_SPACE_001" for item in issues))

    def test_unit_space_rule_does_not_flag_spaced_unit(self):
        issues = run_team_standard_rules("Set the distance to 10 mm.", Path("config/team_standard/rules.yaml"))
        self.assertFalse(any(item["rule_id"] == "UNIT_SPACE_001" for item in issues))


if __name__ == "__main__":
    unittest.main()

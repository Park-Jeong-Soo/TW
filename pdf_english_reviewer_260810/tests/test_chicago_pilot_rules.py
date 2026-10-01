import argparse
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_chicago_{os.getpid()}.db"),
)
os.environ.setdefault(
    "CHICAGO_PILOT_AUDIT_LOG",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_chicago_{os.getpid()}_audit.log"),
)

from app import main
from app.rules.chicago_pilot import BATCH1_RULE_KEYS, HIGH_CONFIDENCE_CHICAGO_RULE_KEYS, TEAM_STANDARD_MATCHERS
from app.rules.engine import run_team_standard_db_rules
from scripts import seed_chicago_pilot_rules as seed


TEST_DB_PATH = Path(tempfile.gettempdir()) / f"pdf_english_reviewer_chicago_{os.getpid()}_isolated.db"
ORIGINAL_DB_PATH = main.DB_PATH


class ChicagoPilotSeedTests(unittest.TestCase):
    def setUp(self):
        main.DB_PATH = TEST_DB_PATH
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
        main.init_db()

    def tearDown(self):
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
        main.DB_PATH = ORIGINAL_DB_PATH

    def _args(self, *, preview=False, apply=False, enable_high_confidence=False):
        return argparse.Namespace(
            batch="1",
            preview=preview,
            apply=apply,
            enable_high_confidence=enable_high_confidence,
            report=False,
            db=str(TEST_DB_PATH),
        )

    def test_preview_does_not_modify_db(self):
        before = TEST_DB_PATH.stat().st_mtime_ns
        result = seed.run(self._args(preview=True, enable_high_confidence=True))
        after = TEST_DB_PATH.stat().st_mtime_ns
        self.assertEqual(result["mode"], "preview")
        self.assertEqual(result["rule_count"], 20)
        self.assertEqual(before, after)
        with main.db_connection() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM team_manual_standard_rules WHERE source_type = 'chicago_pilot'"
            ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_apply_creates_backup_and_is_idempotent(self):
        result = seed.run(self._args(apply=True, enable_high_confidence=True))
        self.assertTrue(Path(result["backup"]).exists())
        self.assertEqual(result["enabled_count"], 5)
        with main.db_connection() as conn:
            rows = conn.execute(
                "SELECT rule_key, enabled, approval_status FROM team_manual_standard_rules WHERE source_type = 'chicago_pilot'"
            ).fetchall()
        self.assertEqual(len(rows), 20)
        self.assertEqual(sum(1 for row in rows if row["enabled"]), 5)
        keys = {row["rule_key"] for row in rows}
        self.assertEqual(keys, BATCH1_RULE_KEYS)
        self.assertTrue(HIGH_CONFIDENCE_CHICAGO_RULE_KEYS <= keys)

        second = seed.run(self._args(apply=True, enable_high_confidence=True))
        self.assertEqual(second["added_keys"], [])
        with main.db_connection() as conn:
            duplicate_count = conn.execute(
                """
                SELECT COUNT(*) FROM (
                    SELECT rule_key FROM team_manual_standard_rules
                    WHERE source_type = 'chicago_pilot'
                    GROUP BY rule_key HAVING COUNT(*) > 1
                )
                """
            ).fetchone()[0]
            existing_keys = {
                row["rule_key"]
                for row in conn.execute(
                    "SELECT rule_key FROM team_manual_standard_rules WHERE source_type <> 'chicago_pilot'"
                ).fetchall()
            }
        self.assertEqual(duplicate_count, 0)
        self.assertIn("UNIT_SPACE_001", existing_keys)
        self.assertIn("STYLE_EG_IE_COMMA_001", existing_keys)
        self.assertIn("TM_CAUTION_LABEL_001", existing_keys)


class ChicagoPilotMatcherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        payload = seed.load_rule_seed(seed.CHICAGO_PILOT_RULES_PATH)
        now = seed.utc_now()
        cls.records = [
            seed.record_for_rule(rule, payload, batch="1", enable_high_confidence=True, now=now)
            for rule in payload["rules"]
        ]

    def test_all_twenty_batch1_rules_have_registered_matchers(self):
        keys = {record["rule_key"] for record in self.records}
        self.assertEqual(keys, BATCH1_RULE_KEYS)
        self.assertEqual(keys - set(TEAM_STANDARD_MATCHERS), set())

    def test_enabled_batch1_rules_positive_negative_exception_and_disabled_behavior(self):
        for record in self.records:
            metadata = seed.json.loads(record["draft_json"])
            if not record["enabled"]:
                continue
            with self.subTest(rule_key=record["rule_key"]):
                enabled_record = dict(record)
                enabled_record["enabled"] = 1
                enabled_record["approval_status"] = "approved"
                positive = metadata["positive_examples"][0]
                negative = metadata["negative_examples"][0]
                exception = metadata["exception_examples"][0]
                self.assertGreaterEqual(len(run_team_standard_db_rules(positive, [enabled_record])), 1)
                self.assertEqual(run_team_standard_db_rules(negative, [enabled_record]), [])
                self.assertEqual(run_team_standard_db_rules(exception, [enabled_record]), [])
                disabled_record = dict(enabled_record)
                disabled_record["enabled"] = 0
                self.assertEqual(run_team_standard_db_rules(positive, [disabled_record]), [])


if __name__ == "__main__":
    unittest.main()

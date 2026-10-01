import argparse
import os
import tempfile
import unittest
from pathlib import Path

import fitz
import yaml

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_chicago_batch2_{os.getpid()}.db"),
)
os.environ.setdefault(
    "CHICAGO_PILOT_AUDIT_LOG",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_chicago_batch2_{os.getpid()}_audit.log"),
)

from app import main
from app.rules.chicago_pilot import BATCH1_RULE_KEYS, BATCH2_RULE_KEYS, TEAM_STANDARD_MATCHERS
from app.rules.engine import run_team_standard_db_rules
from scripts import seed_chicago_pilot_rules as seed


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "chicago_pilot_batch2_cases.yaml"
TEST_DB_PATH = Path(tempfile.gettempdir()) / f"pdf_english_reviewer_chicago_batch2_{os.getpid()}_isolated.db"
ORIGINAL_DB_PATH = main.DB_PATH


class ChicagoPilotBatch2SeedTests(unittest.TestCase):
    def setUp(self):
        main.DB_PATH = TEST_DB_PATH
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
        main.init_db()

    def tearDown(self):
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
        main.DB_PATH = ORIGINAL_DB_PATH

    def _args(self, *, preview=False, apply=False, enable_high_confidence=False, report=False, batch="2"):
        return argparse.Namespace(
            batch=batch,
            preview=preview,
            apply=apply,
            enable_high_confidence=enable_high_confidence,
            report=report,
            db=str(TEST_DB_PATH),
        )

    def test_preview_does_not_modify_db(self):
        before_hash = seed.file_sha256(TEST_DB_PATH)
        before_mtime = TEST_DB_PATH.stat().st_mtime_ns
        result = seed.run(self._args(preview=True, enable_high_confidence=True))
        self.assertEqual(result["mode"], "preview")
        self.assertEqual(result["batch"], "2")
        self.assertEqual(result["rule_count"], 20)
        self.assertEqual(result["enabled_count"], 14)
        self.assertEqual(before_hash, seed.file_sha256(TEST_DB_PATH))
        self.assertEqual(before_mtime, TEST_DB_PATH.stat().st_mtime_ns)
        with main.db_connection() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM team_manual_standard_rules WHERE source_type = 'chicago_pilot'"
            ).fetchone()[0]
        self.assertEqual(count, 0)

    def test_apply_creates_backup_and_adds_exactly_batch2_keys(self):
        with main.db_connection() as conn:
            before_keys = {row["rule_key"] for row in conn.execute("SELECT rule_key FROM team_manual_standard_rules")}
        result = seed.run(self._args(apply=True, enable_high_confidence=True, report=True))
        self.assertTrue(Path(result["backup"]).exists())
        self.assertTrue(Path(result["report"]).exists())
        self.assertEqual(set(result["added_keys"]), BATCH2_RULE_KEYS)
        self.assertEqual(len(set(result["added_keys"])), 20)
        with main.db_connection() as conn:
            after_rows = conn.execute(
                "SELECT rule_key, enabled, approval_status FROM team_manual_standard_rules WHERE source_type = 'chicago_pilot'"
            ).fetchall()
            after_keys = {row["rule_key"] for row in conn.execute("SELECT rule_key FROM team_manual_standard_rules")}
        self.assertEqual(after_keys - before_keys, BATCH2_RULE_KEYS)
        self.assertEqual(len(after_rows), 20)
        self.assertEqual(sum(1 for row in after_rows if row["enabled"]), 14)
        self.assertEqual(sum(1 for row in after_rows if not row["enabled"]), 6)
        self.assertTrue({"UNIT_SPACE_001", "STYLE_EG_IE_COMMA_001", "TM_CAUTION_LABEL_001"} <= after_keys)

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
        self.assertEqual(duplicate_count, 0)

    def test_apply_without_high_confidence_disables_batch2(self):
        seed.run(self._args(apply=True, enable_high_confidence=False))
        with main.db_connection() as conn:
            enabled_count = conn.execute(
                "SELECT COUNT(*) FROM team_manual_standard_rules WHERE source_type = 'chicago_pilot' AND enabled = 1"
            ).fetchone()[0]
        self.assertEqual(enabled_count, 0)

    def test_failure_rolls_back(self):
        original_apply_records = seed.apply_records

        def fail_after_probe(conn, records, now):
            conn.execute(
                "INSERT INTO team_manual_standard_rules (rule_key, title, description, category, matcher_type, pattern, replacement, message, created_at, updated_at) VALUES (?, ?, '', 'x', 'regex', 'x', '', 'x', ?, ?)",
                ("rollback_probe_batch2", "Rollback Probe Batch 2", seed.utc_now(), seed.utc_now()),
            )
            raise RuntimeError("forced failure")

        seed.apply_records = fail_after_probe
        try:
            with self.assertRaises(RuntimeError):
                seed.run(self._args(apply=True, enable_high_confidence=True))
        finally:
            seed.apply_records = original_apply_records
        with main.db_connection() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM team_manual_standard_rules WHERE rule_key = 'rollback_probe_batch2'"
            ).fetchone()[0]
        self.assertEqual(count, 0)


class ChicagoPilotBatch2MatcherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        payload = seed.load_rule_seed(seed.CHICAGO_PILOT_RULES_BATCH2_PATH)
        now = seed.utc_now()
        cls.records = {
            rule["rule_key"]: seed.record_for_rule(rule, payload, batch="2", enable_high_confidence=True, now=now)
            for rule in payload["rules"]
        }
        cls.fixture = yaml.safe_load(FIXTURE_PATH.read_text(encoding="utf-8"))["cases"]

    def test_batch2_inventory_has_twenty_unique_rules_and_five_per_category(self):
        self.assertEqual(set(self.records), BATCH2_RULE_KEYS)
        self.assertFalse(set(self.records) & BATCH1_RULE_KEYS)
        categories: dict[str, int] = {}
        for record in self.records.values():
            categories[record["category"]] = categories.get(record["category"], 0) + 1
        self.assertEqual(
            categories,
            {
                "punctuation": 5,
                "numbers_abbreviations": 5,
                "hyphenation_terminology": 5,
                "grammar": 5,
            },
        )

    def test_all_batch2_rules_have_registered_matchers(self):
        self.assertEqual(BATCH2_RULE_KEYS - set(TEAM_STANDARD_MATCHERS), set())

    def test_fixture_has_required_case_counts(self):
        self.assertEqual(set(self.fixture), BATCH2_RULE_KEYS)
        for rule_key, cases in self.fixture.items():
            with self.subTest(rule_key=rule_key):
                self.assertGreaterEqual(len(cases["positive"]), 3)
                self.assertGreaterEqual(len(cases["negative"]), 3)
                self.assertGreaterEqual(len(cases["exceptions"]), 2)

    def test_each_rule_positive_negative_exception_disabled_and_offsets(self):
        for rule_key, record in self.records.items():
            metadata = seed.json.loads(record["draft_json"])
            enabled_record = dict(record)
            enabled_record["enabled"] = 1
            enabled_record["approval_status"] = "approved"
            with self.subTest(rule_key=rule_key, case_type="source_metadata"):
                self.assertEqual(metadata["pilot_batch"], 2)
                self.assertEqual(metadata["source_standard"], "Chicago Manual of Style")
                self.assertEqual(metadata["source_edition"], "18")
                self.assertTrue(metadata["source_section"])
                self.assertTrue(metadata["source_status"].endswith("_verified"))
                self.assertEqual(metadata["matcher_status"], "implemented")
            for positive in self.fixture[rule_key]["positive"]:
                with self.subTest(rule_key=rule_key, text=positive):
                    issues = run_team_standard_db_rules(positive, [enabled_record])
                    self.assertGreaterEqual(len(issues), 1)
                    self.assertEqual(issues[0]["rule_key"], rule_key)
                    self.assertEqual(issues[0]["rule_id"], rule_key)
                    self.assertTrue(issues[0]["matched_text"])
                    self.assertEqual(positive[issues[0]["start"] : issues[0]["end"]], issues[0]["matched_text"])
            for negative in self.fixture[rule_key]["negative"]:
                with self.subTest(rule_key=rule_key, text=negative):
                    self.assertEqual(run_team_standard_db_rules(negative, [enabled_record]), [])
            for exception in self.fixture[rule_key]["exceptions"]:
                with self.subTest(rule_key=rule_key, text=exception):
                    self.assertEqual(run_team_standard_db_rules(exception, [enabled_record]), [])
            disabled_record = dict(enabled_record)
            disabled_record["enabled"] = 0
            self.assertEqual(run_team_standard_db_rules(self.fixture[rule_key]["positive"][0], [disabled_record]), [])

    def test_batch1_matcher_still_runs(self):
        payload = seed.load_rule_seed(seed.CHICAGO_PILOT_RULES_PATH)
        now = seed.utc_now()
        rule = next(item for item in payload["rules"] if item["rule_key"] == "use_leading_zero_before_decimal")
        record = seed.record_for_rule(rule, payload, batch="1", enable_high_confidence=True, now=now)
        issues = run_team_standard_db_rules("Set the gain to .5.", [record])
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["rule_key"], "use_leading_zero_before_decimal")

    def test_pdf_integration_dry_run_filters_margins_and_structured_noise(self):
        path = Path(tempfile.gettempdir()) / f"chicago_batch2_pdf_{os.getpid()}.pdf"
        pdf = fitz.open()
        for page_number in (1, 2):
            page = pdf.new_page(width=595, height=842)
            page.insert_text((72, 36), "Stop !", fontsize=9)
            page.insert_text((72, 120), "Confirm whether the device is ready?", fontsize=10)
            page.insert_text((72, 150), "Use a two-and-a-half-hour interval.", fontsize=10)
            page.insert_text((72, 190), "Parameter        Value", fontsize=9)
            page.insert_text((72, 812), f"Manual footer {page_number}", fontsize=9)
        pdf.save(path)
        pdf.close()
        try:
            extracted, _pages = main.extract_blocks(path, 2)
        finally:
            path.unlink(missing_ok=True)
        raw_blocks = [block for block in extracted if block.get("reviewable", True)]
        blocks = main.reconstruct_review_blocks(raw_blocks)
        self.assertTrue(any(block["role"] == "header_footer" for block in extracted))
        self.assertFalse(any(block["text"] == "Stop !" and block.get("reviewable", True) for block in extracted))

        records = [dict(record, enabled=1, approval_status="approved") for record in self.records.values()]
        issues = []
        for block in blocks:
            if block.get("role") in {"table_cell", "equation"}:
                continue
            issues.extend(run_team_standard_db_rules(block["text"], records, role=str(block.get("role", "body"))))
        keys = {issue["rule_key"] for issue in issues}
        self.assertIn("use_period_for_indirect_questions", keys)
        self.assertNotIn("remove_space_before_question_or_exclamation_mark", keys)
        self.assertNotIn("avoid_hyphen_in_and_a_half_measurement", keys)


if __name__ == "__main__":
    unittest.main()

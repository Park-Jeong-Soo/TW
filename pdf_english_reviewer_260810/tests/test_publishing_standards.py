import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_tests_{os.getpid()}.db"),
)

from app.main import (
    REVIEW_PROFILES_PATH,
    STANDARDS_DIR,
    create_review_session,
    db_connection,
    get_review_sessions,
    init_db,
)
from app.review.pipeline import deduplicate_by_priority
from app.review.profiles import load_review_profiles
from app.rules.engine import publishing_standard_registry, run_publishing_standard_rules


class PublishingStandardTests(unittest.TestCase):
    def test_standard_discovery(self):
        standards = {item["id"]: item for item in publishing_standard_registry(STANDARDS_DIR)}
        for standard in ("Microsoft", "IEEE", "NIST", "AMS"):
            self.assertIn(standard, standards)
        self.assertNotIn("TeamManual", standards)

    def test_standard_rule_loading(self):
        issues = run_publishing_standard_rules(
            "Set the distance to 10mm. See Equation 1.",
            STANDARDS_DIR,
            enabled_standards={"NIST", "IEEE"},
        )
        rule_ids = {item["rule_id"] for item in issues}
        self.assertIn("NIST_UNIT_SPACE_001", rule_ids)
        self.assertIn("IEEE_EQ_REFERENCE_001", rule_ids)

    def test_review_profiles(self):
        profiles = {item["name"]: item for item in load_review_profiles(REVIEW_PROFILES_PATH)}
        self.assertEqual(profiles["Technical Manual"]["enabled_standards"], ["Microsoft", "IEEE", "NIST"])
        self.assertEqual(profiles["Scientific Paper"]["enabled_standards"], ["IEEE", "NIST", "AMS"])
        self.assertTrue(profiles["Custom"]["custom"])

    def test_standard_priority_and_deduplication(self):
        issues = deduplicate_by_priority(
            [
                {
                    "source_text": "10mm",
                    "replacement": "10 mm",
                    "category": "consistency",
                    "rule_category": "Number-unit spacing",
                    "engine": "publishing_standard",
                    "standard": "Microsoft",
                    "rule_id": "MS_FAKE",
                },
                {
                    "source_text": "10mm",
                    "replacement": "10 mm",
                    "category": "consistency",
                    "rule_category": "Number-unit spacing",
                    "engine": "publishing_standard",
                    "standard": "NIST",
                    "rule_id": "NIST_UNIT_SPACE_001",
                },
            ]
        )
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["standard"], "NIST")
        self.assertIn("MS_FAKE", issues[0]["related_rules"])

    def test_team_manual_standard_wins_duplicate_issue_and_preserves_sources(self):
        issues = deduplicate_by_priority(
            [
                {
                    "source_text": "10mm",
                    "replacement": "10 mm",
                    "category": "consistency",
                    "rule_category": "Number-unit spacing",
                    "engine": "publishing_standard",
                    "standard": "NIST",
                    "rule_id": "NIST_UNIT_SPACE_001",
                },
                {
                    "source_text": "10mm",
                    "replacement": "10 mm",
                    "category": "consistency",
                    "rule_category": "Number-unit spacing",
                    "engine": "team_rule",
                    "standard": "Team Manual Standard",
                    "rule_source": "Team Manual Standard",
                    "rule_id": "UNIT_SPACE_001",
                },
            ]
        )
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["rule_id"], "UNIT_SPACE_001")
        self.assertEqual(issues[0]["standard"], "Team Manual Standard")
        self.assertIn("NIST", issues[0]["sources"])
        self.assertIn("Team Manual Standard", issues[0]["sources"])

    def test_review_session_snapshot(self):
        init_db()
        document_id = "session-test-doc"
        with db_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO documents (
                    id, project_name, reviewer, filename, file_path, created_at,
                    page_count, review_status, file_sha256
                ) VALUES (?, 'Demo', 'Reviewer', 'manual.pdf', 'manual.pdf', '2026-01-01', 1, 'not_started', '')
                """,
                (document_id,),
            )
        create_review_session(
            document_id,
            {"id": "technical_manual"},
            ["languagetool", "team_rule"],
            ["Microsoft", "NIST"],
            "minor",
            selection={
                "review_mode": "custom",
                "selected_engines": ["languagetool"],
                "selected_internal_standards": ["team_manual"],
                "selected_external_standards": ["Microsoft", "NIST"],
            },
            review_mode="custom",
        )
        sessions = get_review_sessions(document_id)
        self.assertEqual(sessions[0]["profile_id"], "technical_manual")
        self.assertEqual(sessions[0]["enabled_standards"], ["Microsoft", "NIST"])
        self.assertEqual(sessions[0]["review_mode"], "custom")
        self.assertEqual(sessions[0]["selection"]["selected_internal_standards"], ["team_manual"])


if __name__ == "__main__":
    unittest.main()

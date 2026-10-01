import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_team_standard_{os.getpid()}.db"),
)

from app import main
from app.rules.engine import run_team_standard_db_rules

TEST_DB_PATH = Path(tempfile.gettempdir()) / f"pdf_english_reviewer_team_standard_{os.getpid()}_isolated.db"
main.DB_PATH = TEST_DB_PATH


class TeamManualStandardDbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()
        main.init_db()

    @classmethod
    def tearDownClass(cls):
        if TEST_DB_PATH.exists():
            TEST_DB_PATH.unlink()

    def test_default_feature_flags_match_consolidation_policy(self):
        self.assertTrue(main.FEATURE_FLAGS["team_standard_db_enabled"])
        self.assertFalse(main.FEATURE_FLAGS["manual_glossary_ui_enabled"])
        self.assertFalse(main.FEATURE_FLAGS["manual_glossary_matcher_enabled"])
        self.assertFalse(main.FEATURE_FLAGS["rule_promotion_actions_ui_enabled"])
        self.assertFalse(main.FEATURE_FLAGS["legacy_team_rule_files_enabled"])

    def test_legacy_team_rules_are_migrated_to_canonical_db(self):
        response = main.list_team_manual_standard_rules(status="")
        keys = {item["rule_key"] for item in response["items"]}
        self.assertIn("UNIT_SPACE_001", keys)
        report = main.team_manual_standard_migration_report()
        self.assertEqual(report["canonical_source"], "data/reviewer.db:team_manual_standard_rules")

    def test_style_seed_yaml_is_imported_as_disabled_candidates(self):
        response = main.list_team_manual_standard_rules(status="")
        seeded = {
            item["rule_key"]: item
            for item in response["items"]
            if item["source_path"] == "config/team_standard/pfm_style_rules.yaml"
        }
        self.assertIn("G001_1", seeded)
        self.assertIn("G001_2", seeded)
        self.assertEqual(seeded["G001_1"]["approval_status"], "candidate")
        self.assertFalse(seeded["G001_1"]["enabled"])
        report = main.team_manual_standard_migration_report()
        self.assertIn("pfm_style_rules.yaml", ",".join(report["style_seed_import"]["sources"]))

    def test_only_enabled_approved_db_rules_execute(self):
        candidate = main.create_team_manual_standard_rule(
            main.TeamManualStandardRuleInput(
                rule_key="TEST_CANDIDATE_ONLY",
                title="Candidate only",
                category="consistency",
                pattern=r"candidateword",
                replacement="candidate word",
                message="Candidate should not run before approval.",
                approval_status="candidate",
                enabled=True,
            )
        )
        with main.db_connection() as conn:
            rules = main.load_active_team_manual_standard_rules(conn)
        self.assertFalse(run_team_standard_db_rules("candidateword", rules))

        main.update_team_manual_standard_rule_status(
            candidate["id"],
            main.TeamManualStandardRuleStatusInput(enabled=True, approval_status="approved"),
        )
        with main.db_connection() as conn:
            rules = main.load_active_team_manual_standard_rules(conn)
        issues = run_team_standard_db_rules("candidateword", rules)
        self.assertTrue(any(issue["rule_id"] == "TEST_CANDIDATE_ONLY" for issue in issues))

        main.update_team_manual_standard_rule_status(
            candidate["id"],
            main.TeamManualStandardRuleStatusInput(enabled=False, approval_status="approved"),
        )
        with main.db_connection() as conn:
            rules = main.load_active_team_manual_standard_rules(conn)
        self.assertFalse(any(issue["rule_id"] == "TEST_CANDIDATE_ONLY" for issue in run_team_standard_db_rules("candidateword", rules)))

    def test_legacy_and_db_duplicate_is_collapsed_by_issue_deduplication(self):
        from app.review.pipeline import deduplicate_by_priority
        from app.rules.engine import run_team_standard_rules

        with main.db_connection() as conn:
            db_rules = main.load_active_team_manual_standard_rules(conn)
        issues = [
            *run_team_standard_db_rules("Set the distance to 10mm.", db_rules),
            *run_team_standard_rules("Set the distance to 10mm.", Path("config/team_standard/rules.yaml")),
        ]
        deduped = deduplicate_by_priority(issues)
        unit_issues = [issue for issue in deduped if issue["source_text"] == "10mm" and issue["replacement"] == "10 mm"]
        self.assertEqual(len(unit_issues), 1)
        self.assertIn("Team Manual Standard", unit_issues[0]["sources"])

    def test_ui_exposes_team_standard_and_hides_glossary_by_default(self):
        html = Path("app/static/index.html").read_text(encoding="utf-8")
        js = Path("app/static/app_v3.js").read_text(encoding="utf-8")
        self.assertIn('id="nav-team-standard"', html)
        self.assertIn('class="nav-btn hidden" id="nav-glossary"', html)
        self.assertIn('manualGlossaryUi: false', js)
        self.assertIn('/api/team-manual-standard/rules', js)

    def test_explicit_review_selection_can_disable_team_manual(self):
        request = main.ReviewRequest(
            grammar=True,
            typos=True,
            use_languagetool=True,
            team_rules=True,
            engines={"languagetool": True, "vale": False, "ollama": False},
            internal_standards={"team_manual": False},
            external_standards={"microsoft": False, "ieee": False, "ams": False, "nist": False},
        )
        selection = main.review_selection_from_request(request, {"enabled_engines": ["team_rule"], "enabled_standards": ["NIST"]})
        self.assertEqual(selection["selected_engines"], [])
        self.assertEqual(selection["selected_internal_standards"], [])
        self.assertEqual(selection["selected_external_standards"], [])

    def test_external_issue_candidate_import_is_manual_candidate_disabled_and_deduped(self):
        document_id = "candidate-doc"
        issue_id = "external-issue-1"
        session_id = "candidate-session"
        with main.db_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO documents (
                    id, project_name, reviewer, filename, file_path, created_at,
                    page_count, review_status, file_sha256
                ) VALUES (?, 'Demo', 'Reviewer', 'manual.pdf', 'manual.pdf', '2026-01-01', 1, 'completed', '')
                """,
                (document_id,),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO issues (
                    id, document_id, page, source_text, replacement, category, level,
                    severity, confidence, explanation_en, explanation_ko, rule_reference,
                    bbox_json, context_text, engine, rule_id, rule_source, rationale,
                    review_session_id, standard, rule_category, reference, message, suggestion,
                    bad_example, good_example, profile, related_engines, related_rules,
                    related_standards, source_type, source_id, source_label, sources_json, created_at
                ) VALUES (?, ?, 1, 'teh', 'the', 'typo', 'correction', 'minor', 0.95,
                    'Spelling issue.', '', 'LT_TEST', '[]', 'Fix teh word.',
                    'languagetool', 'LT_TEST', 'LanguageTool', 'Spelling issue.',
                    ?, 'LanguageTool', 'typo', 'LanguageTool', 'Spelling issue.', 'the',
                    '', '', 'technical_manual', '[]', '[]', '[]',
                    'external_engine', 'languagetool', 'LanguageTool', '["LanguageTool"]', '2026-01-01')
                """,
                (issue_id, document_id, session_id),
            )
        result = main.create_team_standard_candidates_from_issues(
            main.TeamStandardCandidateImportInput(issue_ids=[issue_id])
        )
        self.assertEqual(len(result["created"]), 1)
        with main.db_connection() as conn:
            row = conn.execute(
                "SELECT * FROM team_manual_standard_rules WHERE origin_issue_id = ?",
                (issue_id,),
            ).fetchone()
        self.assertEqual(row["approval_status"], "candidate")
        self.assertEqual(row["enabled"], 0)
        self.assertEqual(row["origin_type"], "external_engine_finding")
        self.assertEqual(row["origin_engine"], "languagetool")
        again = main.create_team_standard_candidates_from_issues(
            main.TeamStandardCandidateImportInput(issue_ids=[issue_id])
        )
        self.assertEqual(again["created"], [])
        self.assertEqual(again["skipped"][0]["reason"], "already_candidate")


if __name__ == "__main__":
    unittest.main()

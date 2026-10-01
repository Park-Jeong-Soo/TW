import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_tests_{os.getpid()}.db"),
)

import app.main as main


class GlossaryDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db = main.DB_PATH
        self.original_manual_dir = main.MANUAL_GLOSSARY_DIR
        main.DB_PATH = Path(self.temp_dir.name) / "reviewer.db"
        main.MANUAL_GLOSSARY_DIR = Path(self.temp_dir.name) / "manual_glossaries"
        main.init_db()
        self.document_id = "manual-doc-1"
        self.manual_db = main.MANUAL_GLOSSARY_DIR / "manual_000.db"
        main.init_manual_glossary_db(self.manual_db)
        with main.db_connection() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, project_name, reviewer, filename, file_path, created_at,
                    page_count, review_status, file_sha256, manual_glossary_db_path
                ) VALUES (?, 'Manual Project', 'Reviewer', 'manual.pdf', ?, ?, 1, 'not_started', 'sha', ?)
                """,
                (self.document_id, str(Path(self.temp_dir.name) / "manual.pdf"), main.utc_now(), str(self.manual_db)),
            )

    def tearDown(self):
        main.DB_PATH = self.original_db
        main.MANUAL_GLOSSARY_DIR = self.original_manual_dir
        self.temp_dir.cleanup()

    def add_term(
        self,
        source,
        term_type="protected",
        preferred="",
        project=None,
        scope="document",
        case_sensitive=False,
    ):
        return main.create_glossary_term(
            main.GlossaryTermInput(
                project_id=project or self.document_id,
                document_id=self.document_id if scope == "document" else "",
                scope=scope,
                term_type=term_type,
                source_term=source,
                preferred_term=preferred,
                case_sensitive=case_sensitive,
            )
        )

    def test_first_run_does_not_seed_3dm_terms(self):
        response = main.list_glossary_terms(
            document_id=self.document_id, scope="common", term_type=None,
            active=None, search="", sort="term", order="asc",
        )
        self.assertEqual(response["counts"]["common"], 0)
        self.assertNotIn("NX-3DM", {item["source_term"] for item in response["items"]})

    def test_deleted_builtin_term_is_not_reseeded(self):
        response = main.list_glossary_terms(
            document_id=self.document_id, scope="common", term_type=None,
            active=None, search="", sort="term", order="asc",
        )
        main.init_db()
        terms = main.list_glossary_terms(
            document_id=self.document_id, scope="common", term_type=None,
            active=None, search="", sort="term", order="asc",
        )["items"]
        self.assertEqual(terms, [])

    def test_project_term_overrides_same_common_source(self):
        self.add_term(
            "scan speed", "preferred", "scan velocity",
            project=main.COMMON_PROJECT, scope="common",
        )
        self.add_term("scan speed", "preferred", "scan rate")
        applied = [
            item for item in main.get_document_dictionary(self.document_id)
            if item["source_term"] == "scan speed"
        ]
        self.assertEqual(len(applied), 1)
        self.assertEqual(applied[0]["preferred_term"], "scan rate")
        self.assertEqual(applied[0]["scope"], "document")

    def test_disable_update_and_delete_apply_immediately(self):
        item = self.add_term("probe", "preferred", "tip")
        finding = main.find_preferred_term_issues(
            "Use the probe.", main.get_document_dictionary(self.document_id)
        )
        self.assertEqual(finding[0]["replacement"], "tip")

        main.set_glossary_term_active(
            item["id"], main.GlossaryActiveUpdate(active=False)
        )
        self.assertEqual(
            main.find_preferred_term_issues(
                "Use the probe.", main.get_document_dictionary(self.document_id)
            ),
            [],
        )

        updated = main.update_glossary_term(
            item["id"],
            main.GlossaryTermInput(
                project_id=self.document_id,
                document_id=self.document_id,
                scope="document",
                term_type="discouraged",
                source_term="probe",
                preferred_term="AFM tip",
                active=True,
            ),
        )
        self.assertEqual(updated["term_type"], "discouraged")
        self.assertEqual(
            main.find_preferred_term_issues(
                "Use the probe.", main.get_document_dictionary(self.document_id)
            )[0]["replacement"],
            "AFM tip",
        )

        main.delete_glossary_term(item["id"])
        self.assertFalse(
            any(
                term["source_term"] == "probe"
                for term in main.get_document_dictionary(self.document_id)
            )
        )

    def test_protected_term_suppresses_basic_spelling_rule(self):
        self.add_term("teh operator", "protected")
        findings = main.check_basic_rules(
            "The teh operator is ready.", main.get_document_dictionary(self.document_id)
        )
        self.assertFalse(any(item["source_text"] == "teh" for item in findings))

    def test_case_sensitive_preferred_term(self):
        self.add_term(
            "Probe", "preferred", "tip", case_sensitive=True
        )
        dictionary = main.get_document_dictionary(self.document_id)
        self.assertEqual(
            main.find_preferred_term_issues("Use the probe.", dictionary), []
        )
        self.assertEqual(
            main.find_preferred_term_issues("Use the Probe.", dictionary)[0]["replacement"],
            "tip",
        )

    def test_case_sensitive_protected_term_violation_is_review_issue(self):
        self.add_term("CR-PFM", "protected", case_sensitive=True)
        dictionary = main.get_document_dictionary(self.document_id)
        findings = main.find_preferred_term_issues(
            "Start the cr-pfm measurement.", dictionary
        )
        violation = next(
            item for item in findings
            if item["rule_reference"] == "glossary_protected_case_sensitive"
        )
        self.assertEqual(violation["source_text"], "cr-pfm")
        self.assertEqual(violation["replacement"], "CR-PFM")
        self.assertEqual(violation["category"], "consistency")

    def test_glossary_term_preserves_engine_suggestion_provenance(self):
        item = main.create_glossary_term(
            main.GlossaryTermInput(
                project_id=self.document_id,
                document_id=self.document_id,
                scope="document",
                term_type="discouraged",
                source_term="scan speed",
                preferred_term="scan rate",
                engine_suggestions=[{"engine": "glossary", "rule_id": "glossary_preferred", "replacement": "scan rate"}],
                provenance={"added_from": "review_results", "source_issue_id": "issue-1"},
            )
        )
        self.assertEqual(item["engine_suggestions"][0]["engine"], "glossary")
        self.assertEqual(item["provenance"]["source_issue_id"], "issue-1")

    def test_legacy_promote_and_ignore_routes_are_disabled(self):
        with self.assertRaises(main.HTTPException) as promoted:
            main.promote_issue_to_rule("missing")
        self.assertEqual(promoted.exception.status_code, 410)
        with self.assertRaises(main.HTTPException) as ignored:
            main.ignore_issue_for_rule("missing", main.IgnoreForRuleInput(rule_id="R1", matched_text="x"))
        self.assertEqual(ignored.exception.status_code, 410)

    def test_project_creation_does_not_seed_3dm_starter_terms(self):
        result = main.create_project(
            main.ProjectCreate(name="New Manual")
        )
        self.assertEqual(result["seeded_terms"], 0)
        self.assertIn("New Manual", main.list_projects())


if __name__ == "__main__":
    unittest.main()

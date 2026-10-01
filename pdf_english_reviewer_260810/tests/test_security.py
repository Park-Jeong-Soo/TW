import asyncio
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import fitz
from fastapi import HTTPException
from starlette.datastructures import UploadFile
from starlette.requests import Request
from starlette.responses import Response

os.environ.setdefault(
    "REVIEWER_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"pdf_english_reviewer_tests_{os.getpid()}.db"),
)

import app.main as main


class SecurityAndLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.originals = {
            name: getattr(main, name)
            for name in (
                "DATA_DIR", "DOC_DIR", "RENDER_DIR", "OCR_DIR", "EXPORT_DIR", "MANUAL_GLOSSARY_DIR",
                "LOG_DIR", "REVIEW_MEMORY_DIR", "AUDIT_LOG_PATH", "DB_PATH",
            )
        }
        main.DATA_DIR = root / "data"
        main.DOC_DIR = main.DATA_DIR / "documents"
        main.RENDER_DIR = main.DATA_DIR / "renders"
        main.OCR_DIR = main.DATA_DIR / "ocr"
        main.EXPORT_DIR = main.DATA_DIR / "exports"
        main.MANUAL_GLOSSARY_DIR = main.DATA_DIR / "manual_glossaries"
        main.LOG_DIR = main.DATA_DIR / "logs"
        main.REVIEW_MEMORY_DIR = main.DATA_DIR / "review_memory"
        main.AUDIT_LOG_PATH = main.LOG_DIR / "audit.log"
        main.DB_PATH = main.DATA_DIR / "reviewer.db"
        for directory in (
            main.DATA_DIR, main.DOC_DIR, main.RENDER_DIR,
            main.OCR_DIR, main.EXPORT_DIR, main.MANUAL_GLOSSARY_DIR, main.LOG_DIR, main.REVIEW_MEMORY_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        main.init_db()
        self.sample = (
            Path(__file__).resolve().parents[1] / "sample_manual_for_test.pdf"
        ).read_bytes()

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(main, name, value)
        self.temp_dir.cleanup()

    def upload(self, payload=None, filename="manual.pdf"):
        async def perform():
            return await main.upload_document(
                UploadFile(io.BytesIO(payload or self.sample), filename=filename),
                "Security Test",
                "Reviewer",
            )

        response = asyncio.run(perform())
        return json.loads(response.body)["document_id"]

    def test_engine_policy_blocks_external_saas(self):
        self.assertTrue(main.endpoint_is_allowed("http://127.0.0.1:11434/api/chat"))
        self.assertTrue(main.endpoint_is_allowed("http://localhost:8081/v2/check"))
        self.assertFalse(main.endpoint_is_allowed("https://api.example.com/v1/chat"))
        self.assertFalse(main.endpoint_is_allowed("https://user:secret@localhost/api"))

    def test_remote_http_client_is_blocked_and_local_headers_are_hardened(self):
        def request_for(host):
            return Request(
                {
                    "type": "http",
                    "method": "GET",
                    "path": "/",
                    "headers": [],
                    "client": (host, 50000),
                    "server": ("127.0.0.1", 8000),
                    "scheme": "http",
                    "query_string": b"",
                }
            )

        async def next_response(_request):
            return Response("ok")

        blocked = asyncio.run(
            main.local_security_middleware(
                request_for("192.168.1.20"), next_response
            )
        )
        self.assertEqual(blocked.status_code, 403)

        local = asyncio.run(
            main.local_security_middleware(
                request_for("127.0.0.1"), next_response
            )
        )
        self.assertEqual(local.headers["cache-control"], "no-store")
        self.assertEqual(local.headers["x-frame-options"], "DENY")
        self.assertIn("default-src 'self'", local.headers["content-security-policy"])

    def test_invalid_signature_is_rejected_and_not_stored(self):
        with self.assertRaises(HTTPException) as context:
            self.upload(b"not a pdf")
        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(list(main.DOC_DIR.iterdir()), [])

    def test_duplicate_upload_is_blocked_by_sha256(self):
        self.upload()
        with self.assertRaises(HTTPException) as context:
            self.upload()
        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(len(list(main.DOC_DIR.iterdir())), 1)

    def test_upload_is_lazy_and_page_render_is_on_demand(self):
        document_id = self.upload()
        self.assertFalse((main.RENDER_DIR / document_id).exists())
        document = main.get_document(document_id)
        self.assertEqual(len(document["pages"]), 1)
        rendered = main.render_page_on_demand(
            document_id, Path(document["file_path"]), 1, 1.0
        )
        self.assertTrue(rendered.exists())

    def test_delete_all_removes_original_cache_ocr_exports_and_database(self):
        document_id = self.upload()
        document = main.get_document_or_404(document_id)
        main.render_page_on_demand(
            document_id, Path(document["file_path"]), 1, 1.0
        )
        ocr_dir = main.OCR_DIR / document_id
        ocr_dir.mkdir(parents=True)
        (ocr_dir / "page_1.txt").write_text("sensitive text", encoding="utf-8")
        (main.EXPORT_DIR / f"{document_id}_review_data.json").write_text(
            "{}", encoding="utf-8"
        )
        result = main.delete_document_data(document_id, "all")
        self.assertEqual(result["target"], "all")
        self.assertFalse(Path(document["file_path"]).exists())
        with self.assertRaises(HTTPException):
            main.get_document_or_404(document_id)

    def test_delete_all_removes_workspace_even_when_original_path_is_outside_storage(self):
        document_id = self.upload()
        outside_original = Path(self.temp_dir.name) / "outside-original.pdf"
        outside_original.write_bytes(self.sample)
        with main.db_connection() as conn:
            conn.execute(
                "UPDATE documents SET file_path = ? WHERE id = ?",
                (str(outside_original), document_id),
            )

        result = main.delete_document_data(document_id, "all")

        self.assertEqual(result["target"], "all")
        self.assertEqual(result["removed"]["original"], 0)
        self.assertTrue(outside_original.exists())
        with self.assertRaises(HTTPException):
            main.get_document_or_404(document_id)

    def test_delete_all_removes_workspace_even_when_generated_file_cleanup_fails(self):
        document_id = self.upload()

        with patch.object(main, "remove_document_renders", side_effect=PermissionError("locked")):
            result = main.delete_document_data(document_id, "all")

        self.assertEqual(result["target"], "all")
        self.assertTrue(result["failed_removals"])
        self.assertEqual(result["failed_removals"][0]["error"], "PermissionError")
        with self.assertRaises(HTTPException):
            main.get_document_or_404(document_id)

    def test_delete_all_removes_workspace_even_when_audit_logging_fails(self):
        document_id = self.upload()

        with patch.object(main, "audit_event", side_effect=OSError("log locked")):
            result = main.delete_document_data(document_id, "all")

        self.assertEqual(result["target"], "all")
        self.assertTrue(
            any(item["target"] == "audit_log" for item in result["failed_removals"])
        )
        with self.assertRaises(HTTPException):
            main.get_document_or_404(document_id)

    def test_audit_log_does_not_store_document_text(self):
        document_id = self.upload()
        main.audit_event(
            "REVIEW_STARTED", document_id=document_id,
            project="Security Test", detail="grammar=True",
        )
        log = main.AUDIT_LOG_PATH.read_text(encoding="utf-8")
        self.assertIn("REVIEW_STARTED", log)
        self.assertNotIn("The scan rate are set", log)

    def test_workspace_progress_is_saved_in_database_and_listed_safely(self):
        document_id = self.upload()
        result = main.save_document_ui_state(
            document_id,
            main.DocumentUiStateInput(
                last_location=main.UiLocation(
                    page_number=1,
                    scroll_offset=0.35,
                    zoom_level=1.2,
                    view_mode="one",
                    label="p.1",
                ),
                tabs=[
                    main.UiLocation(
                        page_number=1,
                        scroll_offset=0.35,
                        zoom_level=1.2,
                        view_mode="one",
                        label="Pinned Page",
                    )
                ],
            ),
        )
        self.assertTrue(result["saved_at"])
        restored = main.get_document_ui_state(document_id)
        self.assertEqual(restored["state"]["last_location"]["scroll_offset"], 0.35)
        workspaces = main.list_documents()
        workspace = next(item for item in workspaces if item["id"] == document_id)
        self.assertTrue(workspace["progress_saved_at"])
        self.assertNotIn("file_path", workspace)
        self.assertNotIn("file_sha256", workspace)

    def test_local_diagnostics_explain_components_without_document_text(self):
        document_id = self.upload()
        result = main.run_local_diagnostics(
            document_id=document_id,
            probe_engines=False,
        )
        names = {check["name"] for check in result["checks"]}
        self.assertIn("SQLite database", names)
        self.assertIn("Original PDF", names)
        self.assertIn("Document storage", names)
        serialized = json.dumps(result)
        self.assertNotIn("The scan rate are set", serialized)

    def test_successful_review_with_zero_findings_has_explicit_outcome(self):
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text((72, 72), "The system is ready.")
        payload = pdf.tobytes()
        pdf.close()
        document_id = self.upload(payload, "clean.pdf")
        result = main.review_document(
            document_id,
            main.ReviewRequest(
                grammar=False,
                typos=True,
                context=False,
                use_languagetool=False,
                use_ollama=False,
                max_pages=1,
            ),
        )
        self.assertEqual(result["issue_count"], 0)
        self.assertEqual(result["outcome"], "no_issues")
        self.assertEqual(main.get_document_or_404(document_id)["review_status"], "completed")
        progress = main.get_review_progress(document_id)
        self.assertEqual(progress["status"], "completed")
        self.assertEqual(progress["percent"], 100)
        self.assertEqual(progress["completed_blocks"], progress["total_blocks"])
        self.assertGreaterEqual(progress["current_page"], 1)

    def test_secure_part_review_never_calls_optional_engines(self):
        document_id = self.upload()
        with (
            patch.object(
                main,
                "check_languagetool",
                side_effect=AssertionError("Secure Part Review must not call LanguageTool"),
            ),
            patch.object(
                main,
                "request_ollama",
                side_effect=AssertionError("Secure Part Review must not call Ollama"),
            ),
        ):
            result = main.review_document(
                document_id,
                main.ReviewRequest(
                    grammar=True,
                    typos=True,
                    context=True,
                    use_languagetool=True,
                    use_ollama=True,
                    secure_part_review=True,
                    max_pages=1,
                ),
            )
        self.assertEqual(result["reviewed_pages"], 1)
        events = main.get_audit_log(limit=100, document_id=document_id)
        started = next(event for event in events["events"] if event["action"] == "REVIEW_STARTED")
        self.assertIn("mode=secure_part", started["detail"])

    def test_ollama_zero_findings_is_logged_without_document_text(self):
        document_id = self.upload()
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "message": {
                "content": json.dumps(
                    {"results": [{"unit_id": "p001-b001", "issues": []}]}
                )
            }
        }
        main.ENGINE_COOLDOWN_UNTIL.clear()
        source_text = "The private system text is correct."
        with patch.object(main.requests, "post", return_value=response):
            findings = main.request_ollama(
                source_text,
                "p001-b001",
                [],
                "qwen2.5:7b",
                role="body",
                is_sentence=True,
                document_id=document_id,
                page=1,
            )
        self.assertEqual(findings, [])
        events = main.get_audit_log(
            limit=100,
            document_id=document_id,
            action="OLLAMA_UNIT_REVIEWED",
        )["events"]
        self.assertEqual(events[-1]["status"], "NO_FINDINGS")
        self.assertIn("findings=0", events[-1]["detail"])
        self.assertNotIn(source_text, json.dumps(events))

    def test_review_eta_uses_only_completed_block_time(self):
        document_id = self.upload()
        main.update_review_progress(
            document_id,
            status="running",
            stage="reviewing",
            total_blocks=4,
            completed_blocks=1,
            _processing_started=main.time.monotonic() - 100,
            _completed_elapsed=10,
        )
        progress = main.get_review_progress(document_id)
        self.assertEqual(progress["eta_seconds"], 30)

    def test_disabled_languagetool_request_is_ignored(self):
        document_id = self.upload()
        policy = {
            "checks": [
                {"key": "binding", "ready": True, "label": "Server Binding"},
                {"key": "storage", "ready": True, "label": "Storage Location"},
            ]
        }
        with (
            patch.object(main, "run_preflight", return_value=policy),
            patch.object(
                main,
                "check_languagetool",
                side_effect=AssertionError("LanguageTool must not be called per text block"),
            ),
        ):
            main.review_document(
                document_id,
                main.ReviewRequest(
                    grammar=True,
                    typos=True,
                    context=False,
                    use_languagetool=True,
                    use_ollama=False,
                    max_pages=1,
                ),
            )
        self.assertEqual(main.get_document_or_404(document_id)["review_status"], "completed")

    def test_unavailable_languagetool_allows_basic_typos_and_format(self):
        document_id = self.upload()
        policy = {
            "checks": [
                {"key": "languagetool", "ready": False, "label": "LanguageTool Local"},
                {"key": "binding", "ready": True, "label": "Server Binding"},
                {"key": "storage", "ready": True, "label": "Storage Location"},
            ]
        }
        with patch.object(main, "run_preflight", return_value=policy):
            result = main.review_document(
                document_id,
                main.ReviewRequest(
                    grammar=False,
                    typos=True,
                    context=False,
                    use_languagetool=True,
                    use_ollama=False,
                    max_pages=1,
                ),
            )
        self.assertEqual(main.get_document_or_404(document_id)["review_status"], "completed")
        self.assertFalse(any("LanguageTool" in warning for warning in result["warnings"]))

    def test_pdf_text_layer_returns_selectable_words_with_coordinates(self):
        document_id = self.upload()
        layer = main.get_page_text_layer(document_id, 1)
        self.assertEqual(layer["page"], 1)
        self.assertGreater(len(layer["words"]), 0)
        self.assertTrue(
            all({"x0", "y0", "x1", "y1", "text"} <= set(word) for word in layer["words"])
        )

    def test_bulk_category_status_can_reject_all_matching_issues(self):
        document_id = self.upload()
        main.review_document(
            document_id,
            main.ReviewRequest(
                grammar=False,
                typos=True,
                context=False,
                use_languagetool=False,
                use_ollama=False,
                max_pages=1,
            ),
        )
        result = main.bulk_update_issues(
            document_id,
            main.BulkIssueUpdate(category="consistency", status="rejected"),
        )
        self.assertGreater(result["updated_count"], 0)
        consistency_issues = [
            issue for issue in main.get_issues(document_id) if issue["category"] == "consistency"
        ]
        self.assertTrue(consistency_issues)
        self.assertTrue(all(issue["status"] == "rejected" for issue in consistency_issues))
        document = main.get_document_or_404(document_id)
        all_issues = main.get_issues(document_id)
        csv_text = main.build_csv(document, all_issues).decode("utf-8-sig")
        json_payload = json.loads(main.build_json_export(document, all_issues))
        self.assertNotIn(",rejected,", csv_text)
        self.assertTrue(all(issue["status"] != "rejected" for issue in json_payload["issues"]))
        open_issue = next(issue for issue in all_issues if issue["status"] == "open")
        main.update_issue(
            open_issue["id"],
            main.IssueUpdate(status="accepted", reviewer_comment="Apply this correction."),
        )
        all_issues = main.get_issues(document_id)
        annotated_path = main.build_annotated_pdf(document, all_issues)
        annotated = fitz.open(annotated_path)
        try:
            annotations = [annotation for page in annotated for annotation in (page.annots() or [])]
            annotation_count = len(annotations)
            self.assertTrue(all(annotation.info["title"].endswith("[accepted]") for annotation in annotations))
            self.assertIn("Apply this correction.", annotations[0].info["content"])
            self.assertIn("Suggestion:", annotations[0].info["content"])
        finally:
            annotated.close()
        self.assertEqual(
            annotation_count,
            len([issue for issue in all_issues if issue["status"] == "accepted"]),
        )


if __name__ == "__main__":
    unittest.main()

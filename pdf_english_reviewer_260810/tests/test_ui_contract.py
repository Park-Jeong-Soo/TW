import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "app" / "static" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "app" / "static" / "app_v3.js").read_text(encoding="utf-8")


class ViewerUiContractTests(unittest.TestCase):
    def test_continuous_viewer_controls_exist(self):
        for element_id in (
            "pdf-document",
            "one-page-mode-btn",
            "two-page-mode-btn",
            "fit-width-btn",
            "fit-page-btn",
            "reset-zoom-btn",
            "page-number-input",
        ):
            self.assertIn(f'id="{element_id}"', HTML)

    def test_lazy_rendering_and_ctrl_wheel_are_implemented(self):
        self.assertIn("IntersectionObserver", JS)
        self.assertIn("state.document.pages.map", JS)
        self.assertIn("releasePageImage", JS)
        self.assertIn("if (!event.ctrlKey) return", JS)
        self.assertIn("event.preventDefault()", JS)

    def test_navigation_history_and_session_restore_exist_without_bookmarks(self):
        for token in (
            "history-back-btn",
            "history-forward-btn",
            "save-progress-btn",
        ):
            self.assertIn(f'id="{token}"', HTML)
        for removed in ("review-tabs", "recent-pages-btn", "all-pages-btn", "page-navigator-popover"):
            self.assertNotIn(f'id="{removed}"', HTML)
        self.assertNotIn("openReviewTab", JS)
        self.assertIn("localStorage.setItem(uiStorageKey()", JS)
        self.assertIn("loadUiState", JS)
        self.assertIn("navigationHistory", JS)

    def test_workspaces_save_and_free_page_navigation_exist(self):
        for element_id in (
            "nav-workspaces",
            "workspaces-view",
            "workspace-list",
            "save-progress-btn",
            "previous-page-btn",
            "next-page-btn",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertNotIn('id="nav-settings"', HTML)
        self.assertNotIn('id="settings-view"', HTML)

    def test_viewer_has_a_real_internal_scroll_container(self):
        css = (ROOT / "app" / "static" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".viewer-panel { min-width: 0; min-height: 0;", css)
        self.assertIn("overflow-y: scroll", css)
        self.assertIn("scrollbar-gutter: stable", css)
        self.assertIn(".issue-controls-grid { flex: 1 1 100%; display: grid;", css)

    def test_failure_guidance_and_workspace_delete_controls_exist(self):
        for element_id in (
            "failure-panel",
            "failure-reason",
            "failure-steps",
            "run-diagnostics-btn",
            "diagnostics-results",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertIn("data-delete-workspace", JS)
        self.assertIn("/api/diagnostics", JS)
        self.assertIn("How to fix", HTML)

    def test_zero_findings_has_success_dialog_not_failure(self):
        for element_id in (
            "no-issues-modal",
            "no-issues-title",
            "no-issues-summary",
            "close-no-issues-modal",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertIn('result.outcome === "no_issues"', JS)
        self.assertIn("This means zero findings, not a program failure", HTML)

    def test_text_selection_bulk_status_and_upload_default_exist(self):
        for element_id in (
            "text-selection-btn",
            "accept-category-btn",
            "reject-category-btn",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertIn('value="system name"', HTML)
        self.assertNotIn('id="pin-page-btn"', HTML)
        self.assertNotIn('"pin-page-btn"', JS)
        self.assertIn("page-text-layer", JS)
        self.assertIn("/text-layer", JS)
        self.assertIn("/issues/bulk", JS)
        self.assertIn('bulkUpdateCategory("rejected")', JS)
        self.assertIn('data-action="rejected"', JS)
        self.assertIn('issue.status !== "rejected"', JS)
        self.assertIn('id="engine-filter"', HTML)
        self.assertIn('id="standard-filter"', HTML)
        for removed_id in ("issue-filter", "severity-filter", "rule-filter", "issue-sort", "issue-order"):
            self.assertNotIn(f'id="{removed_id}"', HTML)
        self.assertNotIn('id="style-form"', HTML)
        self.assertNotIn("Project style", HTML)

    def test_run_local_opens_chrome_automatically(self):
        run_local = (ROOT / "run_local.bat").read_text(encoding="utf-8")
        chrome_script = (ROOT / "scripts" / "open_reviewer_chrome.bat").read_text(encoding="utf-8")
        self.assertIn("open_reviewer_chrome.bat", run_local)
        self.assertIn("chrome.exe", chrome_script)
        self.assertIn("http://127.0.0.1:8000", chrome_script)

    def test_full_and_part_review_follow_live_engine_capabilities(self):
        for removed in ("review-grammar", "review-typos", "review-context"):
            self.assertNotIn(f'id="{removed}"', HTML)
        self.assertIn('id="recheck-workspace-engines-btn"', HTML)
        self.assertIn('id="run-full-review-btn"', HTML)
        self.assertIn('id="run-part-review-btn"', HTML)
        for category in (
            "typo",
            "grammar",
            "awkward",
            "content",
            "consistency",
            "format",
            "punctuation",
            "capitalization",
            "numbers_abbreviations",
            "hyphenation_terminology",
        ):
            self.assertIn(f'<option value="{category}">', HTML)
        for removed in ("spelling", "clarity", "conciseness", "terminology"):
            self.assertNotIn(f'<option value="{removed}">', HTML)
        self.assertIn("Team Manual Standard pilot categories", HTML)
        self.assertIn('"numbers_abbreviations"', JS)
        self.assertIn('"hyphenation_terminology"', JS)
        self.assertIn("const typos = true", JS)
        self.assertIn("const grammar = false", JS)
        self.assertIn('const context = currentEngines.includes("ollama")', JS)
        self.assertIn('runReview("full")', JS)
        self.assertIn('runReview("part")', JS)
        self.assertIn("scheduleEngineStatusPoll", JS)
        self.assertIn("12000", JS)
        self.assertIn("secure_part_review: false", JS)
        self.assertIn("internal_standards: selectedInternalStandardFlags()", JS)
        self.assertIn("external_standards: selectedExternalStandardFlags()", JS)
        self.assertIn("use_languagetool: false", JS)
        self.assertIn('"run-part-review-btn").disabled = !basicReady || state.reviewRunning', JS)
        self.assertIn("Custom Review runs only the selected external engines", HTML)

    def test_review_profile_standard_engine_controls_exist(self):
        for element_id in (
            "review-profile-select",
            "publishing-standards-list",
            "standard-filter",
            "export-glossary-xlsx-btn",
            "export-glossary-txt-btn",
            "export-glossary-db-btn",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertNotIn('id="nav-rule-dashboard"', HTML)
        self.assertNotIn('id="nav-review-memory"', HTML)
        self.assertNotIn('id="rule-dashboard-view"', HTML)
        self.assertNotIn('id="review-memory-view"', HTML)
        self.assertNotIn('id="engine-config-engine-list"', HTML)
        for token in (
            "Publishing Standards",
            "External Review Engines",
            "Internal Standards",
            "Review Engines",
            "Team Manual Standard",
            "Glossary",
            "Ollama",
        ):
            self.assertIn(token, HTML)
        self.assertNotIn("LanguageTool", HTML)
        self.assertIn("markProfileCustom", JS)
        self.assertIn('state.activeProfileId = "custom"', JS)
        self.assertIn("enabled_standards", JS)
        self.assertIn("enabled_engines", JS)
        self.assertIn("exportGlossaryExcel", JS)
        self.assertIn("Manual Glossary", HTML)
        self.assertIn('id="glossary-provenance-panel"', HTML)
        self.assertNotIn("Promote to Rule", JS)
        self.assertNotIn("Ignore to Rule", JS)
        self.assertIn("Add Selected to Team Manual Standard", HTML)
        self.assertIn("data-team-candidate-issue", JS)

    def test_ollama_metadata_log_is_visible_and_refreshable(self):
        for element_id in (
            "ollama-log-list",
            "refresh-ollama-log-btn",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertIn("loadOllamaReviewLog", JS)
        self.assertIn("OLLAMA_UNIT_REVIEWED", JS)
        self.assertIn("Document text is never logged", HTML)

    def test_review_progress_shows_location_engine_and_eta(self):
        for element_id in (
            "review-progress-panel",
            "review-progress-stage",
            "review-progress-percent",
            "review-progress-location",
            "review-progress-engine",
            "review-progress-time",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertIn("/review/progress", JS)
        self.assertIn("Current engine:", JS)
        self.assertIn("remaining", JS)
        self.assertIn("setInterval(loadReviewProgress, 1000)", JS)

    def test_engine_status_and_batch_start_contract_exist(self):
        for element_id in (
            "nav-engines",
            "engine-status-view",
            "engine-check-grid",
            "recheck-engines-btn",
            "review-mode-note",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertIn("Review Engines", HTML)
        self.assertIn("engineRoleDescription", JS)
        self.assertIn("full_review_ready", JS)
        self.assertIn("Custom Review ready", JS)
        run_local = (ROOT / "run_local.bat").read_text(encoding="utf-8")
        self.assertIn("uvicorn app.main:app --host 127.0.0.1 --port 8000", run_local)
        self.assertIn("scripts\\preflight.py", run_local)
        self.assertNotIn("pip install", run_local)
        self.assertNotIn("ExecutionPolicy Bypass", (ROOT / "create_desktop_shortcut.bat").read_text(encoding="utf-8"))
        self.assertNotIn("Stop Reviewer", HTML)
        self.assertFalse((ROOT / "PDF English Reviewer Launcher.pyw").exists())
        self.assertFalse((ROOT / "build_launcher.bat").exists())
        shortcut_script = (ROOT / "create_desktop_shortcut.bat").read_text(encoding="utf-8")
        self.assertIn("PDF English Reviewer.lnk", shortcut_script)
        self.assertIn("run_local.bat", shortcut_script)
        self.assertIn("WorkingDirectory", shortcut_script)
        self.assertTrue((ROOT / "SETUP_GUIDE.md").exists())


if __name__ == "__main__":
    unittest.main()


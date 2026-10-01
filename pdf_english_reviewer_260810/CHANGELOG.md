# Changelog

## 2026-07-21

- Created the `pdf_english_reviewer_260721` working folder from `pdf_english_reviewer_260720`.
- Added a Chicago Manual of Style 18th edition Team Manual Standard pilot seed file with 20 rules.
- Added `scripts/seed_chicago_pilot_rules.py` with preview, apply, backup, and idempotent UPSERT behavior.
- Added Team Manual Standard matcher registry support for the Chicago pilot keys.
- Updated Review Results to show Key, Rule, Category, Source, and Severity for pilot findings.
- Kept LanguageTool disabled by default and left Rule Management UI disabled.
- Added Chicago Pilot Batch 2 with 20 additional non-duplicate Team Manual Standard rules, Batch 2 fixtures/tests, source research report, and `--batch`/`--all` seed support.

## 2026-07-20

- Created the `pdf_english_reviewer_260720` working folder from `pdf_english_reviewer_260716`.
- Disabled LanguageTool by default with `LANGUAGETOOL_ENABLED=0`.
- Removed LanguageTool from the visible review engine UI, engine status summary, and engine filter.
- Updated review profiles and API selection handling so `languagetool` is not selected or executed.
- Changed `run_local.bat` and `scripts/start_local_engines.ps1` so LanguageTool is not started automatically.
- Kept historical LanguageTool-related backend helper code and legacy configuration files in place for provenance and old data compatibility, but outside the default runtime path.

## 2026-07-16

- Created the `pdf_english_reviewer_260716` working folder from `pdf_english_reviewer_260714`.
- Added Team Manual Standard SQLite canonical table, idempotent migration from legacy TeamManual YAML sources, and DB-backed regex execution.
- Added default feature flags that keep Team Manual Standard DB enabled while hiding Manual Glossary UI/matcher, rule-promotion actions, and legacy TeamManual YAML/Vale runtime paths.
- Added `/api/team-manual-standard/*` rule list/create/update/status/validate/migration-report endpoints and `/api/features`.
- Added a visible Team Manual Standard management screen and hid Manual Glossary navigation by default while preserving legacy code and data.
- Added pre-consolidation backups under `data/backups/pre_team_standard_db_260716/`.
- Removed unused root Markdown analysis and duplicate handoff files, keeping only the active guide, setup, changelog, README, and review criteria documents.
- Removed the test-only `TEST_CANDIDATE_ONLY` row from the operational DB, restored real Team Manual rules to approved/enabled, excluded `TeamManual` from external publishing standards, and preserved duplicate issue sources during deduplication.
- Split review selection into External Review Engines, Internal Standards, and External Publishing Standards; added manual external-engine finding import to Team Manual Standard as candidate/disabled rules only.

## 2026-07-14

- Changed glossary storage from project-based terms to manual PDF-based glossary databases under `data/manual_glossaries/`.
- Added automatic `<manual name>_000.db` glossary DB creation during PDF upload and export options for DB, TXT, and Excel.
- Removed NX-3DM starter/common glossary seed content from code, UI, and README guidance.
- Removed user-facing Rule Dashboard and Review Memory navigation tabs.
- Simplified Review Engines to a single Engine Status screen and added role descriptions to each status card.
- Added Manual Glossary Excel export for the currently filtered glossary terms.
- Changed Ignore to Rule so it records the exception and feedback, then deletes the original suggestion row from review results.
- Kept Promote to Rule persistence through `rule_registry`.

## 2026-07-13

- Added Rule Dashboard with rule inventory, rule findings, statistics, server-side pagination, filtering, Open in Review, and `.xlsx` export.
- Added Review Engines screen with Engine Info, existing Engine Status integration, and Customize Review stored in `app_metadata`.
- Added Review Memory backup, download, validation, preview, TXT apply import, automatic pre-import backup, and safe timestamp backup IDs.
- Simplified Reviewer result filters to Category, Engine, and Standard dropdowns while preserving review workflow actions.
- Added `openpyxl>=3.1.0` for Excel export.
- Fixed frontend Ignore to Rule and Promote to Rule calls to use the existing `api()` wrapper.
- Added regression and contract tests for the new routes, Excel safety, Review Memory TXT escaping, and updated Reviewer filter UI contract.

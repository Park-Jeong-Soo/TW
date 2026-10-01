# PDF English Reviewer — Local MVP

A local-first web application for reviewing English in technical-manual PDFs. It provides a browser workspace for PDF pages, proofreading suggestions, project terminology, review states, annotated-PDF export, and CSV reporting.

## 2026-07-21 Chicago pilot build

This folder is the `pdf_english_reviewer_260721` revision. It keeps the
LanguageTool-disabled policy from `260720` and adds a Chicago Manual of Style
18th edition Team Manual Standard pilot.

Batch 2 adds 20 additional non-duplicate Chicago-supported Team Manual Standard
rules. The research and duplicate-check record is in
`docs/chicago_rule_research_batch2.md`.

```powershell
.\.venv\Scripts\python.exe scripts\seed_chicago_pilot_rules.py --batch 2 --preview
.\.venv\Scripts\python.exe scripts\seed_chicago_pilot_rules.py --batch 2 --apply --enable-high-confidence --report
```

- Seed data lives in `config/team_standard/chicago_pilot_rules.yaml`.
- Run `scripts/seed_chicago_pilot_rules.py --preview` to inspect DB changes.
- Run `scripts/seed_chicago_pilot_rules.py --apply --enable-high-confidence`
  to back up `data/reviewer.db` and upsert the 20 pilot rules.
- Eight high-confidence pilot rules are enabled by default when that option is
  used; the remaining 12 are stored as disabled candidates.
- Review Results show Team Manual Standard Key, Rule, Category, Source, and
  Severity for pilot findings.

## 2026-07-20 LanguageTool disabled build

This folder is the `pdf_english_reviewer_260720` revision. LanguageTool is disabled by default and removed from the visible review UI.

Default behavior:

```text
LANGUAGETOOL_ENABLED=0
```

- `run_local.bat` no longer starts LanguageTool.
- Review profiles no longer select `languagetool`.
- The Review workspace no longer shows a LanguageTool checkbox or status row.
- API requests that include `use_languagetool=true` are forced off before review execution.
- Built-in basic typo/format rules, Vale, Team Manual Standard, external publishing standards, glossary storage, and Ollama remain available according to their existing flags and readiness.


## 2026-07-16 Team Manual Standard consolidation

This folder uses `data/reviewer.db` as the canonical source for internal Team Manual Standard writing rules. Legacy YAML/Vale TeamManual files are preserved as migration sources, but the default runtime path loads enabled and approved rules from SQLite only.

Default feature flags:

```text
TEAM_STANDARD_DB_ENABLED=1
TEAM_RULE_MANAGEMENT_UI_ENABLED=0
MANUAL_GLOSSARY_UI_ENABLED=0
MANUAL_GLOSSARY_MATCHER_ENABLED=0
RULE_PROMOTION_ACTIONS_UI_ENABLED=0
LEGACY_TEAM_RULE_FILES_ENABLED=0
```

The visible internal rule-management screen is **Team Manual Standard**. Manual Glossary UI/API code is retained for future terminology integration, but its navigation and automatic matcher are disabled by default.

External publishing standards are limited to Microsoft, IEEE, AMS, and NIST. The legacy `config/standards/TeamManual/` folder is preserved as migration/provenance data, but Team Manual rules run from the SQLite Team Manual Standard table by default. Duplicate findings with the same source text and replacement keep one visible issue and preserve all contributing sources.

Review setup is split into External Review Engines, Internal Standards, and External Publishing Standards. Custom Review runs only the selected items. Vale and Ollama findings are never written automatically to Team Manual Standard; users can select external-engine findings and save them manually as disabled candidate rules for later validation.

## What this MVP includes

- PDF upload and local storage
- Acrobat-style continuous PDF viewer with lazy page rendering
- Select Text mode for dragging and copying native PDF text
- 1 Page / 2 Pages modes, 50-250% zoom, Fit Width, Fit Page, and Ctrl+Wheel
- Previous/next review locations and refresh-safe UI state
- Workspaces list for reopening previous documents
- Explicit **Save Progress** to store page, scroll position, zoom, and view mode in SQLite
- Per-workspace deletion with confirmation and complete local-data cleanup
- Failure details with reason, corrective steps, and privacy-safe local diagnostics
- Optional local **Ollama** integration for conservative clarity/consistency refinements
- Basic offline fallback rules for common typos, number–unit spacing, and ASCII arrows
- Shared `run_local.bat`/web Preflight checks for local engines, approved models, cloud disablement, bindings, and storage
- Project dictionary:
  - Approved terms (do not flag)
  - Preferred terms (suggest replacement)
  - Forbidden terms (suggest replacement)
- Review statuses: Open, Accepted, Ignored, Needs review
- Category-level Accept/Reject actions for Review Results
- Reviewer comments on each review card; **Add to Glossary** is retained in code but hidden by default during Team Manual Standard consolidation
- Project style rules for number-unit spacing and range/arrow notation
- Category/status filters and automatic current-page tracking
- CSV review-report export
- Portable JSON review-data export
- Annotated PDF export with comments/highlights
- Optional local Tesseract OCR through PyMuPDF
- Local audit log, retention policy, and granular document-data deletion
- Local-only HTTP access, security headers, and fail-closed engine URL policy

## Important scope limit

This version is intentionally a **review and annotation tool**, not a PDF reflow editor. It does **not** rewrite original PDF text or preserve a revised layout after text replacement. For manual publishing, accept the suggestion in the tool and apply the final wording in the Word, InDesign, FrameMaker, or source-document workflow.

## 1. Install

### Windows PowerShell

```powershell
cd pdf_english_reviewer
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000` in a browser.

For Windows, the standard start method is to double-click `run_local.bat`.
It checks the existing Python runtime, dependencies, engines, approved model,
security configuration, storage, and port before binding the service to
`127.0.0.1:8000`. It does not create environments, download packages, or
install software.
When Reviewer starts, the batch file opens `http://127.0.0.1:8000` in Google
Chrome when Chrome is installed, with the Windows default browser as fallback.

Run `create_desktop_shortcut.bat` once to create a desktop shortcut named
`PDF English Reviewer`. The shortcut targets `run_local.bat`; it is not a
separate executable or launcher.

### macOS / Linux

```bash
cd pdf_english_reviewer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 2. LanguageTool Local

LanguageTool is disabled in this `260720` build. Do not start or configure a
LanguageTool server for the default workflow. Legacy LanguageTool helper code
and configuration files remain in the folder only for provenance and historical
data compatibility.

## 3. Ollama Local for Context

Context is automatically included in every Full Review after secure Ollama
Local and the approved model are ready. The default endpoint and model are:

```text
OLLAMA_URL=http://127.0.0.1:11434/api/chat
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_NO_CLOUD=1
OLLAMA_HOST=127.0.0.1:11434
REVIEWER_OLLAMA_WEB_SEARCH=0
REVIEWER_OLLAMA_TOOL_CALLING=0
```

Example:

```bash
ollama pull qwen2.5:7b
ollama serve
```

PDF content is explicitly treated as untrusted data in the Ollama prompt.
Document instructions are not executed. Output is restricted to localized,
high-confidence review findings and must not alter technical data, safety
warnings, numbers, units, model names, UI labels, formulas, or protected terms.

## 4. Manual Glossary

The glossary is managed in the web application through **Manual Glossary**.
Each uploaded manual PDF receives its own SQLite glossary file under
`data/manual_glossaries/`, named from the uploaded manual filename such as
`Manual Name_000.db`. Excel, TXT, and DB export are available from the screen.

The screen supports:

- Common, Manual, and combined scopes
- Protected, Preferred, and Discouraged term types
- Add, edit, enable/disable, and delete
- Search plus type/status/scope filters
- Alphabetical and updated-date sorting
- Case-sensitive matching and descriptions
- **Add to Glossary** directly from a Reviewer suggestion card

During review, active common terms are combined with active terms from the
current manual's glossary DB. A manual term overrides a common term with the
same source text.

Existing terms from the original `dictionary_terms` table are migrated into the
new glossary schema on startup. Restart the local server after upgrading so the
migration runs before using the new management screen.

Approved terms also protect product names, model names, abbreviations, and UI
labels from project terminology replacement. The basic checker does not make
subject-verb Grammar corrections. Context requires secure Ollama Local and an
approved installed model.

Figure-title capitalization uses a fixed local rule:

- Figure titles capitalize content words except articles, prepositions, and
  conjunctions.
- `TM`, `RTM`, trademark symbols, acronyms, and tokens containing numbers are
  preserved.
- Table of Contents dot leaders are excluded from review text.

Full Review adds a conservative CMOS profile from
`config/grammar_custom.xml`: serial commas in simple parallel series, commas
after `e.g.`/`i.e.`, and `US` without periods. Broad context-sensitive style
preferences are not auto-flagged.

The Reviewer exposes two engine-aware actions:

- **Full Review** is enabled when secure Ollama, the approved model, and all
  local security checks are ready. Typos, standards, terminology, and selected
  Context checks are included.
- **Part Review** remains enabled whenever the local viewer runtime is ready,
  including when optional engines are disconnected. It is a security-limited
  mode: Ollama is forcibly disabled, and only fixed typo, number-unit spacing,
  range notation, Figure-title capitalization, and Applied Glossary checks run.

General whitespace and punctuation-adjacent spacing are excluded. Full Review
records metadata-only Ollama outcomes per unit, including `NO_FINDINGS`, in the
workspace log without storing document text.

Engine status is refreshed automatically every 12 seconds and can also be
checked immediately with **Recheck engines now**.

## 5. Acceptance test

The repository includes `sample_manual_for_test.pdf`, containing the requested
intentional errors. In the upload screen:

1. Upload the sample manual PDF.
2. Add `scan speed` as a Preferred term with `scan rate` as its preferred form.
3. Run Full Review when Ollama is ready, or run the available Custom Review.
4. Confirm Basic Format rules report `20mm/s → 20 mm/s`, plus
   `scan speed → scan rate`, and the range-format suggestion.
5. Change statuses, enter a reviewer comment, and export CSV, JSON, and annotated PDF.

Glossary acceptance checks:

1. Open **Manual Glossary**, select the uploaded manual, and switch Scope between
   Common, Manual, and All.
2. Add `scan speed → scan rate` as a Preferred term.
3. Edit its replacement, disable and re-enable it, then confirm the list and
   next review reflect each change.
4. Use **Add to Glossary** on a Reviewer card and confirm the current manual is
   preselected.
5. Delete a test term and confirm it is no longer applied.

Viewer and security checks:

1. Scroll from the first page to the last page inside the Viewer and confirm the
   current page number updates. The Viewer has its own always-enabled scrollbar.
2. Switch between 1 Page and 2 Pages, then test Fit Width, Fit Page, Reset, and
   Ctrl+Mouse Wheel.
3. Move freely with Previous Page, Next Page, and direct page-number input.
   Page navigation does not require selecting a review comment.
4. Select **Select Text**, drag across native PDF text, copy it, then turn the
   mode off to restore clickable review highlights.
5. Select one Review Results category and test **Accept Category** and
   **Reject Category**.
6. Select suggestions on different pages, use Previous/Next Review Location,
   then select **Save Progress**.
7. Open **Workspaces**, resume the saved document, and confirm page, scroll,
   zoom, and view mode are restored.
8. Delete a test workspace and confirm its PDF, review results, renders, OCR,
   exports, and saved progress are removed.
9. Use the four document deletion options and confirm only the selected local
   data is removed.

Also confirm that this valid plural sentence is not changed by Basic Rules:

```text
The main factors slowing the speed of the AFM are the XYZ Scanner's response rate and the response rate of the circuit which detects changes in the cantilever's resonant frequency.
```

Run the automated regression suite:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

On Windows, `run_tests.bat` runs the same suite and writes the complete failure
trace, source file, and line number to `data/logs/test_latest.log`.

Regenerate the sample PDF after editing its source text:

```powershell
.\.venv\Scripts\python.exe scripts\generate_sample_pdf.py
```

The stable final sample is also written to `output/pdf/sample_manual_for_test.pdf`.
Expected CSV and JSON results are included in `examples/`, and a rendered
annotated example is available at `output/pdf/sample_annotated_review.pdf`.

## 6. File locations

Runtime data are kept locally in `data/`:

```text
data/reviewer.db             # SQLite review-history database
data/documents/              # Uploaded PDFs
data/renders/                # On-demand page render cache
data/ocr/                    # Local OCR text
data/exports/                # CSV, JSON, and annotated PDF files
data/logs/audit.log          # Metadata-only local audit events
output/pdf/                  # Stable sample PDF artifact
```

These paths are excluded from Git by default.

## 7. Architecture and extension points

- `app/main.py`: FastAPI routes, SQLite glossary/review persistence, PyMuPDF
  extraction/rendering/annotation, fallback rules, and local engine adapters.
- `app/static/`: dependency-free browser UI. It creates all page placeholders,
  requests visible/adjacent page images lazily, releases distant images, and
  overlays saved PyMuPDF block coordinates.
- `LANGUAGETOOL_URL`, `OLLAMA_URL`, and `OLLAMA_MODEL`: local integration
  configuration. New cloud or internal engines can be added as adapters without
  changing the stored issue/export schema.
- `source_text` from Ollama is accepted only when it is an exact continuous
  substring of the reviewed block, and low-confidence output is discarded.

## 8. Security and local storage

- Both launch scripts bind Uvicorn to `127.0.0.1`.
- The application also rejects non-loopback HTTP clients.
- No CORS middleware is enabled because frontend and API share one origin.
- Every response receives `no-store`, `nosniff`, no-referrer, frame denial, and
  a self-only Content Security Policy.
- Uploads are streamed to disk with a 60 MB default limit, checked for PDF
  signature, encryption, page count, page geometry, estimated render workload,
  corruption, and SHA-256 duplicates.
- Page images are generated only when requested and the render cache has a size
  limit with oldest-file eviction.
- Ollama fails closed when its URL is neither loopback nor administrator-approved.
- Audit records contain action metadata and IDs, never PDF sentences or complete
  OCR text.
- Retention and audit APIs remain local. The Engine Status page exposes only
  local component/security state and corrective steps.
- Do not place the project or `data/` directory in OneDrive, Dropbox, Google
  Drive, a shared public folder, or another synchronized location.

Environment safety limits can be adjusted by an administrator:

```text
MAX_UPLOAD_MB=60
MAX_PDF_PAGES=300
MAX_RENDER_PIXELS=40000000
MAX_RENDER_CACHE_MB=750
MAX_OCR_PAGES=20
MAX_OCR_SECONDS=180
MAX_REVIEW_SECONDS=600
```

## 9. Optional local OCR

The Reviewer uses PyMuPDF's local OCR integration. Install Tesseract and the
required language data on the same PC, then select **OCR current page**.
Extracted OCR text is written only under `data/ocr/<document-id>/` and is used
for review when the PDF page has no extractable text. OCR page and time limits
are enforced by the application.

## 10. MVP limitations

- Highlights use text-block coordinates, so multiple findings in one block share
  an overlay. This is the documented MVP fallback.
- Accept changes review state only; it does not rewrite or reflow original PDF text.
- OCR depends on a separately installed local Tesseract runtime.
- This version is intentionally single-user and local-only. Shared-server and
  remote-access deployment are outside scope.

## 11. Failure diagnosis

When upload, review, OCR, workspace opening, saving, or deletion fails, the UI
opens a failure panel containing:

- the server-provided reason;
- status-specific corrective steps;
- a **Run Local Diagnostics** button.

Diagnostics checks SQLite read/write access, local storage folders, the selected
PDF record and file, PDF readability, cloud-sync path risk, and local engine
endpoint policy. It does not return PDF sentences or OCR text.

A successful review with zero findings is handled separately. The UI displays
**No issues found**, the number of reviewed pages, selected checks, and any
optional-engine notice. It never labels a zero-finding result as a failure.

Common resolutions:

| Failure | Recommended action |
|---|---|
| Local server did not respond | Restart `run_local.bat` and reopen `127.0.0.1:8000` |
| Duplicate PDF | Resume or delete the existing entry under Workspaces |
| Original PDF missing | Delete the unavailable workspace and upload again |
| Timeout | Check both local engines and the approved model, or split the PDF |
| OCR unavailable | Install local Tesseract and language data |
| Endpoint blocked | Use localhost or configure `APPROVED_ENGINE_HOSTS` |
| Database/folder not writable | Close DB tools and verify Windows folder permissions |

## 12. Practical next upgrades

1. Add user login and per-reviewer audit trail.
2. Add sentence-level text coordinates instead of block-level overlays.
3. Add sentence-level highlight coordinates for OCR output.
4. Add DOCX source-document export or tracked-change workflow.
5. Add a cancellable worker process for long OCR and context-review jobs.

## 13. Rule-Based Review Architecture (260709)

This revision adds a local rule-evidence layer for technical manual review.

- Team standard rules are loaded from `config/team_standard/rules.yaml`.
- Glossary standard files live under `config/team_standard/`.
- Legacy LanguageTool disabled rule IDs remain in `config/languagetool/disabled_languagetool_rules.txt`.
- Legacy `config/languagetool/grammar_custom.xml` is preserved for provenance but is not used by default in this build.
- Vale is optional. Place an IT-approved binary at `tools/vale/vale.exe` or `engines/vale/vale.exe` to enable Vale style checks.
- Every saved issue now carries `engine`, `rule_id`, `rule_source`, `rationale`, `reviewer_decision`, and feedback metadata.

New rule APIs:

```text
GET    /api/rules
POST   /api/rules/reload
GET    /api/rules/status
GET    /api/rules/{rule_id}
PATCH  /api/rules/{rule_id}
POST   /api/issues/{issue_id}/feedback
POST   /api/issues/{issue_id}/promote-to-rule
POST   /api/glossary/import
GET    /api/glossary/export.csv
POST   /api/standards/import
GET    /api/standards/export
GET    /api/engines/vale/status
POST   /api/engines/vale/test
```

Run focused rule tests with:

```powershell
.\scripts\run_rule_tests.bat
```

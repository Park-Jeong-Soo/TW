# PDF English Reviewer Setup Guide

## 2026-07-21 note

This `pdf_english_reviewer_260721` build adds a Chicago Manual of Style 18th
edition Team Manual Standard pilot. The pilot is seeded into SQLite, not edited
through the disabled Rule Management UI:

```powershell
.\.venv\Scripts\python.exe scripts\seed_chicago_pilot_rules.py --preview
.\.venv\Scripts\python.exe scripts\seed_chicago_pilot_rules.py --apply --enable-high-confidence
```

The apply command creates a timestamped DB backup under `data\backups\` before
upserting the 20 pilot rules.

## 2026-07-20 note

This `pdf_english_reviewer_260720` build disables LanguageTool by default:

```text
LANGUAGETOOL_ENABLED=0
```

Do not start or configure LanguageTool for the default local run. `run_local.bat` starts only the remaining local engines it is allowed to use, and the UI no longer exposes LanguageTool as a selectable review engine.

The Reviewer never downloads or installs Python packages, Ollama, or an AI model.
Use only packages and model files approved by your IT or security team.

## Required Components

1. Python Runtime 3.10 or later
2. Required Python packages from `requirements.txt`
3. Ollama Local
4. Approved Ollama Model
5. Local-only endpoint configuration
6. Cloud feature disable configuration
7. `run_local.bat` startup

## Full Review Configuration

1. Start Ollama Local at `http://127.0.0.1:11434` if context review is needed.
2. Install the approved local model `qwen2.5:7b` from an approved offline source.
3. Set `OLLAMA_NO_CLOUD=1` before starting Ollama.
4. Set `OLLAMA_HOST=127.0.0.1:11434`.
5. Keep `REVIEWER_OLLAMA_WEB_SEARCH=0`.
6. Keep `REVIEWER_OLLAMA_TOOL_CALLING=0`.
7. Keep `REVIEWER_HOST=127.0.0.1`.
8. Keep `LANGUAGETOOL_ENABLED=0`.

Example environment configuration:

```bat
set OLLAMA_NO_CLOUD=1
set OLLAMA_HOST=127.0.0.1:11434
set REVIEWER_OLLAMA_WEB_SEARCH=0
set REVIEWER_OLLAMA_TOOL_CALLING=0
set REVIEWER_HOST=127.0.0.1
set LANGUAGETOOL_ENABLED=0
set OLLAMA_URL=http://127.0.0.1:11434/api/chat
set OLLAMA_MODEL=qwen2.5:7b
```

Restart Ollama and the Reviewer after changing environment variables.

## Approved installer folder

Ask your IT administrator for the approved internal or offline installer folder.
The Reviewer intentionally does not open a public download site.

- Run `open_approved_installer_folder.bat` after IT configures the
  `APPROVED_INSTALLER_FOLDER` environment variable.
- Run `copy_setup_commands.bat` to copy local-only configuration commands.
- No script requests administrator rights or installs packages automatically.

## Start Reviewer

1. Double-click `run_local.bat`.
2. Review the Preflight results.
3. If Full Review is unavailable, choose Setup Guide, Basic Viewer, Recheck, or Exit.
4. When checks pass, the browser opens `http://127.0.0.1:8000`.

If the browser does not open, enter that address manually.

To stop Reviewer, press `Ctrl+C` in the `run_local.bat` console or close that
console window. The web application intentionally has no Stop Reviewer button.

## Desktop Shortcut

Run `create_desktop_shortcut.bat` once. It creates
`PDF English Reviewer.lnk` on the current user's Desktop with:

- Target: `run_local.bat`
- Start in: the Reviewer installation folder
- Icon: a standard Windows document icon

The shortcut does not start a separate executable.

## Basic Viewer

Secure Part Review remains available when optional engines are disconnected. It
uses fixed local typo, number-unit spacing, range notation, Figure-title
capitalization, and glossary rules only; it never calls Ollama. Context requires
Ollama plus an approved local model.

## Rule Engine Setup

1. Keep team rules in `config\team_standard\rules.yaml`.
2. Keep team glossary data in `config\team_standard\glossary.csv`.
3. Optional: place an approved Vale binary at `tools\vale\vale.exe`.
4. Use `GET /api/rules/status` or the Engine Status screen to verify rule files.

Vale is optional. If Vale is missing, the application still runs with Basic Viewer, Team Standard Rules, and Glossary when available.


from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from app.review.text_mapping import find_search_text_for_line


class ValeExecutionError(RuntimeError):
    pass


def find_vale_executable(base_dir: Path) -> Path | None:
    candidates = [
        base_dir / "tools" / "vale" / "vale.exe",
        base_dir / "engines" / "vale" / "vale.exe",
        base_dir / "tools" / "vale" / "vale",
    ]
    return next((path for path in candidates if path.exists()), None)


def vale_status(base_dir: Path) -> dict[str, Any]:
    exe = find_vale_executable(base_dir)
    config = base_dir / "config" / "vale" / ".vale.ini"
    styles = base_dir / "config" / "vale" / "styles" / "TeamManual"
    status = {
        "available": bool(exe),
        "path": str(exe or ""),
        "config_exists": config.exists(),
        "team_style_exists": styles.exists(),
        "version": "",
        "last_error": None,
    }
    if exe:
        try:
            result = subprocess.run([str(exe), "--version"], capture_output=True, text=True, timeout=5, encoding="utf-8", errors="replace")
            status["version"] = (result.stdout or result.stderr).strip()
            status["available"] = result.returncode == 0
        except (OSError, subprocess.SubprocessError) as exc:
            status["available"] = False
            status["last_error"] = type(exc).__name__
    return status


def parse_vale_json(stdout: str, source_text: str) -> list[dict[str, Any]]:
    try:
        payload = json.loads(stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ValeExecutionError(f"Vale returned invalid JSON: {exc}") from exc
    alerts: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list):
                alerts.extend(item for item in value if isinstance(item, dict))
    issues: list[dict[str, Any]] = []
    for alert in alerts:
        line = int(alert.get("Line", 0) or 0)
        rule_id = str(alert.get("Check") or "vale")
        match_text = str(alert.get("Match") or "").strip()
        span = alert.get("Span")
        search_text = match_text
        if not search_text and isinstance(span, str):
            search_text = span
        if not search_text:
            search_text = find_search_text_for_line(source_text, line, str(alert.get("Message", "")))
        message = str(alert.get("Message") or "Vale style suggestion.")
        severity = "major" if str(alert.get("Severity", "")).lower() == "error" else "minor"
        issues.append(
            {
                "source_text": search_text[:160] or "Vale style alert",
                "replacement": str(alert.get("Suggestion") or "Review style suggestion"),
                "category": "consistency" if "Terms" in rule_id else "format" if "Units" in rule_id else "awkward",
                "level": "correction",
                "severity": severity,
                "confidence": 0.85,
                "explanation_en": message,
                "explanation_ko": "Vale 스타일 규칙에 따른 제안입니다.",
                "rule_reference": rule_id,
                "rule_id": rule_id,
                "engine": "vale",
                "rule_source": "Vale TeamManual",
                "rationale": message,
                "annotation_available": bool(search_text and search_text in source_text),
                "mapping_status": "mapped" if search_text and search_text in source_text else "not_mapped",
                "display_scope": "pdf_annotation" if search_text and search_text in source_text else "review_panel_only",
            }
        )
    return issues


def run_vale_text(text: str, base_dir: Path, *, timeout: int = 60) -> list[dict[str, Any]]:
    exe = find_vale_executable(base_dir)
    config = base_dir / "config" / "vale" / ".vale.ini"
    config_dir = config.parent
    if not exe or not config.exists() or not text.strip():
        return []
    with tempfile.TemporaryDirectory(prefix="pdf-reviewer-vale-") as temp_dir:
        temp_path = Path(temp_dir) / "review.md"
        temp_path.write_text(text, encoding="utf-8")
        result = subprocess.run(
            [str(exe), f"--config={config}", "--output=JSON", str(temp_path)],
            cwd=str(config_dir),
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    if result.stdout.strip():
        return parse_vale_json(result.stdout, text)
    if result.stderr.strip() and result.returncode not in {0, 1}:
        raise ValeExecutionError(result.stderr.strip())
    return []


def run_vale_diagnostic(base_dir: Path, text: str = "Set the distance to 10mm.") -> dict[str, Any]:
    exe = find_vale_executable(base_dir)
    config = base_dir / "config" / "vale" / ".vale.ini"
    status = vale_status(base_dir)
    diagnostic: dict[str, Any] = {
        "binary_available": bool(exe),
        "version": status.get("version", ""),
        "config_loaded": config.exists(),
        "styles_loaded": ["TeamManual"] if (base_dir / "config" / "vale" / "styles" / "TeamManual").exists() else [],
        "return_code": None,
        "stdout": "",
        "stderr": "",
        "parsed_alert_count": 0,
        "passed": False,
    }
    if not exe or not config.exists():
        return diagnostic
    with tempfile.TemporaryDirectory(prefix="pdf-reviewer-vale-test-") as temp_dir:
        temp_path = Path(temp_dir) / "review.md"
        temp_path.write_text(text, encoding="utf-8")
        result = subprocess.run(
            [str(exe), f"--config={config}", "--output=JSON", str(temp_path)],
            cwd=str(config.parent),
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
    diagnostic["return_code"] = result.returncode
    diagnostic["stdout"] = result.stdout[:4000]
    diagnostic["stderr"] = result.stderr[:4000]
    try:
        issues = parse_vale_json(result.stdout, text) if result.stdout.strip() else []
    except ValeExecutionError as exc:
        diagnostic["stderr"] = str(exc)
        issues = []
    diagnostic["parsed_alert_count"] = len(issues)
    diagnostic["passed"] = any(issue.get("rule_id") in {"TeamManual.Units", "UNIT_SPACE_001"} for issue in issues)
    diagnostic["issues"] = issues
    return diagnostic


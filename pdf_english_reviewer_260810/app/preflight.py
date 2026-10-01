from __future__ import annotations

import importlib.util
import ipaddress
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


DEFAULT_LT_URL = os.getenv("LANGUAGETOOL_URL", "http://127.0.0.1:8081/v2/check")
DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
APPROVED_MODELS = tuple(
    item.strip()
    for item in os.getenv("APPROVED_OLLAMA_MODELS", DEFAULT_MODEL).split(",")
    if item.strip()
)
TRUE_VALUES = {"1", "true", "yes", "on"}
LANGUAGETOOL_ENABLED = os.getenv("LANGUAGETOOL_ENABLED", "0").strip().casefold() in TRUE_VALUES


def _enabled(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().casefold() in TRUE_VALUES


def _approved_hosts() -> set[str]:
    return {
        item.strip().casefold()
        for item in os.getenv("APPROVED_ENGINE_HOSTS", "").split(",")
        if item.strip()
    }


def endpoint_is_local_or_approved(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            return False
        host = parsed.hostname.casefold()
        if host == "localhost":
            return True
        try:
            if ipaddress.ip_address(host).is_loopback:
                return True
        except ValueError:
            pass
        return any(host == item or host.endswith(f".{item}") for item in _approved_hosts())
    except ValueError:
        return False


def endpoint_label(url: str) -> str:
    try:
        parsed = urlparse(url)
        return f"{parsed.hostname or 'invalid'}{f':{parsed.port}' if parsed.port else ''}"
    except ValueError:
        return "invalid"


def storage_is_local(data_dir: Path) -> tuple[bool, str]:
    resolved = str(data_dir.resolve())
    lowered = resolved.casefold()
    sync_markers = ("onedrive", "dropbox", "google drive", "googledrive")
    if resolved.startswith("\\\\"):
        return False, "Network/shared storage paths are blocked."
    if os.name == "nt":
        try:
            import ctypes

            drive = Path(resolved).drive
            if drive and ctypes.windll.kernel32.GetDriveTypeW(f"{drive}\\") == 4:
                return False, "Mapped network drive storage is blocked."
        except (AttributeError, OSError):
            pass
    if any(marker in lowered for marker in sync_markers):
        return False, "Cloud-synchronized storage paths are blocked."
    return True, resolved


def _post_form(url: str, values: dict[str, str], timeout: float) -> dict[str, Any]:
    request = Request(
        url,
        data=urlencode(values).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _get_json(url: str, timeout: float) -> dict[str, Any]:
    with urlopen(Request(url, method="GET"), timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _check_port(port: int) -> tuple[bool, str, bool]:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.3)
            occupied = sock.connect_ex(("127.0.0.1", port)) == 0
        if not occupied:
            return True, f"Port {port} is available.", False
        try:
            payload = _get_json(f"http://127.0.0.1:{port}/api/health", 0.8)
            if payload.get("application") == "PDF English Reviewer":
                return True, f"Reviewer is already running on port {port}.", True
        except (OSError, URLError, ValueError, json.JSONDecodeError):
            pass
        return False, f"Port {port} is used by another application.", False
    except OSError as exc:
        return False, f"Port check failed ({type(exc).__name__}).", False




def _check_rule_architecture(base_dir: Path) -> list[tuple[str, str, bool, str, str, bool]]:
    checks: list[tuple[str, str, bool, str, str, bool]] = []
    required_files = [
        ("vale_config", "Vale Config", base_dir / "config" / "vale" / ".vale.ini"),
        ("team_style", "Vale TeamManual Style", base_dir / "config" / "vale" / "styles" / "TeamManual"),
        ("team_rules", "Team Standard Rules", base_dir / "config" / "team_standard" / "rules.yaml"),
        ("team_glossary", "Team Standard Glossary", base_dir / "config" / "team_standard" / "glossary.csv"),
    ]
    if LANGUAGETOOL_ENABLED:
        required_files.extend(
            [
                ("lt_disabled_rules", "LanguageTool Disabled Rules", base_dir / "config" / "languagetool" / "disabled_languagetool_rules.txt"),
                ("lt_custom_rules", "LanguageTool Custom Rules", base_dir / "config" / "languagetool" / "grammar_custom.xml"),
            ]
        )
    for key, label, path in required_files:
        checks.append((key, label, path.exists(), f"Found: {path}" if path.exists() else f"Missing: {path}", "Restore the approved rule configuration files.", True))
    vale_candidates = [base_dir / "tools" / "vale" / "vale.exe", base_dir / "engines" / "vale" / "vale.exe", base_dir / "tools" / "vale" / "vale"]
    vale = next((item for item in vale_candidates if item.exists()), None)
    vale_ok = False
    vale_detail = "Vale binary is optional and was not found."
    if vale:
        try:
            result = subprocess.run([str(vale), "--version"], capture_output=True, text=True, timeout=5)
            vale_ok = result.returncode == 0
            vale_detail = (result.stdout or result.stderr or str(vale)).strip()
        except (OSError, subprocess.SubprocessError) as exc:
            vale_detail = f"Vale failed ({type(exc).__name__})."
    checks.append(("vale_binary", "Vale Binary", vale_ok, vale_detail, "Place the IT-approved Vale binary under tools/vale or engines/vale.", False))
    git_dir = base_dir / ".git"
    git_valid = (git_dir / "HEAD").exists() or (git_dir / "config").exists()
    checks.append(("git_repo", "Git Repository", git_valid, "Valid Git metadata found." if git_valid else ".git is missing or incomplete.", "Run scripts/init_git_repo.ps1 when ready to version standards.", False))
    return checks

def _check_dependencies() -> tuple[bool, str]:
    required = ("fastapi", "fitz", "multipart", "requests", "uvicorn")
    missing = [name for name in required if importlib.util.find_spec(name) is None]
    if missing:
        return False, f"Missing Python packages: {', '.join(missing)}"
    return True, "Reviewer dependencies are ready."


def run_preflight(
    base_dir: Path,
    data_dir: Path,
    *,
    probe_engines: bool = True,
    check_dependencies: bool = True,
    check_port: bool = True,
    languagetool_url: str | None = None,
    ollama_url: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    lt_url = languagetool_url or DEFAULT_LT_URL
    ollama_url = ollama_url or DEFAULT_OLLAMA_URL
    requested_model = model or DEFAULT_MODEL
    checks: list[dict[str, Any]] = []

    def add(key: str, label: str, ok: bool, detail: str, fix: str = "", blocking: bool = True):
        checks.append(
            {
                "key": key,
                "label": label,
                "status": "ready" if ok else ("blocked" if blocking else "warning"),
                "ready": ok,
                "detail": detail,
                "fix": fix,
                "blocking": blocking,
            }
        )

    add("python", "Python Runtime", sys.version_info >= (3, 10), sys.version.split()[0], "Install approved Python 3.10 or later.")
    reviewer_files = all(
        (base_dir / relative).exists()
        for relative in ("app/main.py", "app/static/index.html", "run_local.bat")
    )
    add("files", "Reviewer Files", reviewer_files, "Required files found." if reviewer_files else "Required application files are missing.", "Restore the approved Reviewer package.")
    if check_dependencies:
        dependencies_ok, dependencies_detail = _check_dependencies()
        add("dependencies", "Reviewer Dependencies", dependencies_ok, dependencies_detail, "Run the approved offline dependency setup.")
    for key, label, ok, detail, fix, blocking in _check_rule_architecture(base_dir):
        add(key, label, ok, detail, fix, blocking=blocking)

    lt_allowed = True
    if LANGUAGETOOL_ENABLED:
        lt_allowed = endpoint_is_local_or_approved(lt_url)
        lt_ready = False
        lt_detail = f"Endpoint: {endpoint_label(lt_url)}"
        if not lt_allowed:
            lt_detail = "External or unapproved endpoint is blocked."
        elif probe_engines:
            try:
                _post_form(lt_url, {"text": "The system is ready.", "language": "en-US"}, 1.5)
                lt_ready = True
                lt_detail = f"Ready at {endpoint_label(lt_url)}"
            except (OSError, URLError, ValueError, json.JSONDecodeError):
                lt_detail = f"Not connected at {endpoint_label(lt_url)}"
        add("languagetool", "LanguageTool Local", lt_allowed and lt_ready, lt_detail, "Start LanguageTool Local on localhost:8081.")

    ollama_allowed = endpoint_is_local_or_approved(ollama_url)
    ollama_ready = False
    installed_models: list[str] = []
    ollama_detail = f"Endpoint: {endpoint_label(ollama_url)}"
    if not ollama_allowed:
        ollama_detail = "External or unapproved endpoint is blocked."
    elif probe_engines:
        try:
            parsed = urlparse(ollama_url)
            payload = _get_json(f"{parsed.scheme}://{parsed.netloc}/api/tags", 1.5)
            installed_models = [
                str(item.get("name", ""))
                for item in payload.get("models", [])
                if item.get("name")
            ]
            ollama_ready = True
            ollama_detail = f"Ready at {endpoint_label(ollama_url)}"
        except (OSError, URLError, ValueError, json.JSONDecodeError):
            ollama_detail = f"Not connected at {endpoint_label(ollama_url)}"
    add("ollama", "Ollama Local", ollama_allowed and ollama_ready, ollama_detail, "Start Ollama Local on localhost:11434.")

    approved_found = next(
        (name for name in installed_models if name in APPROVED_MODELS),
        "",
    )
    model_ready = bool(approved_found) and requested_model in APPROVED_MODELS
    add(
        "model",
        "Approved AI Model",
        model_ready,
        approved_found or f"Approved model not found ({', '.join(APPROVED_MODELS)}).",
        f"Use an IT-approved offline package for: {requested_model}",
    )

    cloud_disabled = _enabled("OLLAMA_NO_CLOUD")
    cloud_models = [name for name in installed_models if name.casefold().endswith(":cloud")]
    cloud_safe = cloud_disabled and not cloud_models
    add(
        "cloud",
        "Ollama Cloud Features",
        cloud_safe,
        "Disabled" if cloud_safe else "Cloud disablement is not verified.",
        "Set OLLAMA_NO_CLOUD=1 before starting Ollama and remove cloud models.",
    )
    web_safe = not _enabled("REVIEWER_OLLAMA_WEB_SEARCH")
    tools_safe = not _enabled("REVIEWER_OLLAMA_TOOL_CALLING")
    add("web_search", "Ollama Web Search", web_safe, "Disabled in Reviewer" if web_safe else "Enabled", "Set REVIEWER_OLLAMA_WEB_SEARCH=0.")
    add("tool_calling", "Ollama Tool Calling", tools_safe, "Disabled in Reviewer" if tools_safe else "Enabled", "Set REVIEWER_OLLAMA_TOOL_CALLING=0.")
    ollama_host = os.getenv("OLLAMA_HOST", "127.0.0.1:11434").strip()
    ollama_host_url = ollama_host if "://" in ollama_host else f"http://{ollama_host}"
    ollama_host_safe = endpoint_is_local_or_approved(ollama_host_url)
    add(
        "ollama_host",
        "Ollama Server Binding",
        ollama_host_safe,
        ollama_host,
        "Set OLLAMA_HOST=127.0.0.1:11434 and restart Ollama.",
    )

    binding = os.getenv("REVIEWER_HOST", "127.0.0.1").strip()
    binding_safe = binding in {"127.0.0.1", "localhost"}
    add("binding", "Server Binding", binding_safe, binding, "Set REVIEWER_HOST=127.0.0.1.")
    storage_safe, storage_detail = storage_is_local(data_dir)
    add("storage", "Storage Location", storage_safe, storage_detail, "Move Reviewer outside cloud-sync and shared folders.")
    external_transfer_safe = all(
        (
            ollama_allowed,
            cloud_safe,
            web_safe,
            tools_safe,
            ollama_host_safe,
            binding_safe,
            storage_safe,
        )
    )
    add(
        "external_transfer",
        "External Data Transfer",
        external_transfer_safe,
        "Disabled" if external_transfer_safe else "Blocked pending secure local configuration.",
        "Use only approved local endpoints and disable Ollama cloud, Web Search, and Tool Calling.",
    )
    reviewer_running = False
    if check_port:
        port_ok, port_detail, reviewer_running = _check_port(int(os.getenv("REVIEWER_PORT", "8000")))
        add(
            "port",
            "Reviewer Port",
            port_ok,
            port_detail,
            "Close the other application using port 8000.",
            blocking=True,
        )

    full_ready = all(item["ready"] for item in checks if item["blocking"])
    security_keys = {
        "cloud", "web_search", "tool_calling", "ollama_host",
        "binding", "storage", "external_transfer",
    }
    security_ready = all(item["ready"] for item in checks if item["key"] in security_keys)
    return {
        "full_review_ready": full_ready,
        "basic_viewer_ready": reviewer_files
        and all(
            item["ready"]
            for item in checks
            if item["key"] in {"python", "dependencies", "binding", "storage", "port", "vale_config", "team_style", "team_rules", "team_glossary"}
        ),
        "reviewer_running": reviewer_running,
        "security_ready": security_ready,
        "approved_models": list(APPROVED_MODELS),
        "requested_model": requested_model,
        "installed_models": installed_models,
        "checks": checks,
        "external_data_transfer": "Disabled" if security_ready else "Blocked pending configuration",
    }

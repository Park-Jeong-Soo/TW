
from __future__ import annotations

import re
from pathlib import Path

DEFAULT_ABBREVIATIONS = {"e.g.", "i.e.", "Fig.", "No.", "Dr.", "vs.", "etc.", "approx."}


def load_abbreviations(path: Path | None = None) -> set[str]:
    if path and path.exists():
        values = {line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip() and not line.strip().startswith("#")}
        return values | DEFAULT_ABBREVIATIONS
    return set(DEFAULT_ABBREVIATIONS)


def split_sentences(text: str, abbreviations: set[str] | None = None) -> list[str]:
    abbreviations = abbreviations or DEFAULT_ABBREVIATIONS
    placeholders: dict[str, str] = {}
    protected = text
    for index, abbr in enumerate(sorted(abbreviations, key=len, reverse=True)):
        token = f"<ABBR{index}>"
        placeholders[token] = abbr
        protected = protected.replace(abbr, token)
    pieces = re.split(r"(?<=[.!?])\s+", protected)
    result = []
    for piece in pieces:
        restored = piece
        for token, abbr in placeholders.items():
            restored = restored.replace(token, abbr)
        if restored.strip():
            result.append(restored.strip())
    return result


def first_lexical_token(text: str) -> tuple[str, int] | None:
    match = re.search(r"[A-Za-z][A-Za-z'-]*", text)
    if not match:
        return None
    return match.group(0), match.start()

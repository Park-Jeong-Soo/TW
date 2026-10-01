from __future__ import annotations


def find_search_text_for_line(text: str, line_number: int, fallback: str = "") -> str:
    lines = text.splitlines()
    if 1 <= line_number <= len(lines):
        return lines[line_number - 1].strip()[:120]
    return fallback.strip()[:120]

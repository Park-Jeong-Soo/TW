
from __future__ import annotations

import re
from typing import Any

SENTENCE_END_RE = re.compile(r"[.!?][\)\]\}\"'”’]*\s*$")
BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)]|[A-Za-z][.)])\s+")
CAPTION_RE = re.compile(r"^\s*(?:Figure|Table)\s+[A-Za-z0-9.-]+\b", re.I)
CALLOUT_RE = re.compile(r"^\s*(?:CAUTION|WARNING|DANGER|NOTE)\b", re.I)
PROSE_ROLES = {"body", "callout"}


def should_dehyphenate(left: str, right: str) -> bool:
    if not left.endswith("-") or not right:
        return False
    left_word = re.search(r"([A-Za-z]{3,})-$", left.strip())
    right_word = re.match(r"\s*([a-z]{2,})", right)
    if not left_word or not right_word:
        return False
    return True


def join_soft_line_break(left: str, right: str) -> str:
    if not left:
        return right.strip()
    if should_dehyphenate(left, right):
        return left.rstrip()[:-1] + right.lstrip()
    return left.rstrip() + " " + right.lstrip()


def is_new_paragraph(previous: dict[str, Any], current: dict[str, Any]) -> bool:
    if previous.get("page") != current.get("page"):
        return True
    prev_role = previous.get("role", "body")
    curr_role = current.get("role", "body")
    if prev_role != curr_role:
        return True
    if curr_role not in {"body", "callout"}:
        return True
    text = str(current.get("text", ""))
    prev_text = str(previous.get("text", ""))
    if BULLET_RE.match(text) or CAPTION_RE.match(text) or CALLOUT_RE.match(text):
        return True
    if SENTENCE_END_RE.search(prev_text):
        return True
    px0, py0, px1, py1 = [float(v) for v in previous.get("bbox", [0, 0, 0, 0])]
    x0, y0, x1, y1 = [float(v) for v in current.get("bbox", [0, 0, 0, 0])]
    font = float(current.get("font_size") or 0)
    prev_font = float(previous.get("font_size") or 0)
    line_height = max(font, prev_font, 8.0)
    vertical_gap = y0 - py1
    if vertical_gap < -line_height * 0.25 or vertical_gap > line_height * 1.8:
        return True
    if abs(x0 - px0) > max(18.0, line_height * 2.5):
        return True
    if font and prev_font and abs(font - prev_font) > 1.5:
        return True
    return False


def union_bbox(blocks: list[dict[str, Any]]) -> list[float]:
    boxes = [item.get("bbox", [0, 0, 0, 0]) for item in blocks]
    return [
        round(min(float(box[0]) for box in boxes), 2),
        round(min(float(box[1]) for box in boxes), 2),
        round(max(float(box[2]) for box in boxes), 2),
        round(max(float(box[3]) for box in boxes), 2),
    ]


def reconstructed_sentence_like(text: str, role: str, parts: list[dict[str, Any]]) -> bool:
    if role not in PROSE_ROLES:
        return False
    if any(bool(part.get("is_sentence")) for part in parts):
        return True
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", text)
    if len(words) < 3:
        return False
    return bool(SENTENCE_END_RE.search(text))


def reconstruct_review_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(blocks, key=lambda item: (int(item.get("page", 0)), float(item.get("bbox", [0, 0, 0, 0])[1]), float(item.get("bbox", [0, 0, 0, 0])[0])))
    units: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    for block in ordered:
        if not block.get("reviewable", True):
            continue
        if current and is_new_paragraph(current[-1], block):
            units.append(_make_unit(current))
            current = []
        current.append(block)
    if current:
        units.append(_make_unit(current))
    for index, unit in enumerate(units):
        unit["block_index"] = index
    return units


def _make_unit(parts: list[dict[str, Any]]) -> dict[str, Any]:
    text = ""
    for part in parts:
        text = join_soft_line_break(text, str(part.get("text", "")))
    first = parts[0]
    text = re.sub(r"\s+", " ", text).strip()
    role = str(first.get("role", "body"))
    return {
        **first,
        "text": text,
        "bbox": union_bbox(parts),
        "source_blocks": parts,
        "source_block_indices": [item.get("block_index") for item in parts],
        "is_reconstructed": len(parts) > 1,
        "is_sentence": reconstructed_sentence_like(text, role, parts),
    }

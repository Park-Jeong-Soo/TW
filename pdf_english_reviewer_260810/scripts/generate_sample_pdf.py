from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "sample_manual_for_test.pdf",
    ROOT / "output" / "pdf" / "sample_manual_for_test.pdf",
]

LINES = [
    ("NX-3DM English Review Test", 18),
    ("", 11),
    ("The scan rate are set to 20mm/s during high-speed measurement.", 12),
    ("The system have two scanners.", 12),
    ("The teh operator must confirm the scan speed before measurement.", 12),
    ("The output changes 2 mm/s->20mm/s.", 12),
]


def build_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=595, height=842)
    y = 72
    for text, size in LINES:
        if text:
            page.insert_text((72, y), text, fontsize=size, fontname="helv")
        y += 32 if size >= 18 else 24
    metadata = document.metadata
    metadata.update(
        {
            "title": "PDF English Reviewer MVP Test Manual",
            "author": "Local PDF English Reviewer",
            "subject": "Intentional English errors for acceptance testing",
        }
    )
    document.set_metadata(metadata)
    payload = document.tobytes(garbage=4, deflate=True)
    document.close()
    return payload


if __name__ == "__main__":
    pdf = build_pdf()
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(pdf)
        print(target)

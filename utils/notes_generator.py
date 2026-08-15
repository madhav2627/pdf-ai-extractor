"""
notes_generator.py — Generate structured study notes from PDFs (no external API)
Detects headings via font size, extracts definitions, formulas, bullet points.
"""
import re
import fitz
from collections import defaultdict


# ── Text extraction with structure ────────────────────────────────────────

def _extract_structured(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    sections = []
    all_sentences = []

    for i in range(len(doc)):
        page = doc[i]
        blocks = page.get_text("dict")["blocks"]
        page_headings = []
        page_body = []

        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_text = ""
                max_size = 0
                is_bold = False
                for span in line.get("spans", []):
                    t = span["text"].strip()
                    if t:
                        line_text += " " + t
                        max_size = max(max_size, span.get("size", 12))
                        flags = span.get("flags", 0)
                        if flags & 0b10000:  # bold flag
                            is_bold = True

                line_text = line_text.strip()
                if not line_text:
                    continue

                if (max_size >= 13 or is_bold) and len(line_text) < 150 and len(line_text) > 3:
                    page_headings.append(line_text)
                else:
                    page_body.append(line_text)
                    all_sentences.extend(re.split(r'(?<=[.!?])\s+', line_text))

        sections.append({
            "page": i + 1,
            "headings": page_headings,
            "body": " ".join(page_body),
        })

    doc.close()
    return {
        "sections": sections,
        "all_sentences": [s.strip() for s in all_sentences if len(s.strip()) > 30],
    }


# ── Pattern detectors ─────────────────────────────────────────────────────

def _is_definition(s: str) -> bool:
    return bool(re.search(
        r'\b(is defined as|refers to|means|is a type of|defined as|is an|is the)\b',
        s, re.IGNORECASE
    ))


def _is_formula_like(s: str) -> bool:
    return bool(re.search(r'[=+\-×÷/\\]|[A-Z]\s*=\s*|\\frac|\\sum|\bequation\b|\bformula\b', s))


def _is_bullet_like(s: str) -> bool:
    return bool(re.match(r'^[\-•*▪◦→]\s|^\d+[.)]\s', s))


def _extract_definitions(sentences: list) -> list:
    defs = []
    for s in sentences:
        if _is_definition(s) and len(s) < 400:
            defs.append(s)
    return defs[:20]


def _extract_key_points(sentences: list) -> list:
    kw = {"important", "key", "note", "remember", "critical", "must", "always",
          "never", "essential", "significant", "primary", "main", "major"}
    points = []
    for s in sentences:
        words = set(re.findall(r'\b\w+\b', s.lower()))
        if words & kw:
            points.append(s)
    return points[:15]


# ── Note formatters ───────────────────────────────────────────────────────

def _format_study_notes(sections: list, sentences: list) -> str:
    parts = ["# Study Notes\n"]
    definitions = _extract_definitions(sentences)
    key_points = _extract_key_points(sentences)

    for sec in sections:
        if sec["headings"]:
            for h in sec["headings"]:
                parts.append(f"\n## {h}")
        if sec["body"]:
            body_sentences = re.split(r'(?<=[.!?])\s+', sec["body"])
            for s in body_sentences[:5]:
                s = s.strip()
                if len(s) > 40:
                    parts.append(f"• {s}")

    if definitions:
        parts.append("\n---\n## Key Definitions")
        for d in definitions:
            parts.append(f"• {d}")

    if key_points:
        parts.append("\n---\n## Important Points")
        for p in key_points:
            parts.append(f"★ {p}")

    return "\n".join(parts)


def _format_exam_notes(sections: list, sentences: list) -> str:
    parts = ["# Exam Notes\n"]
    definitions = _extract_definitions(sentences)
    key_points = _extract_key_points(sentences)
    formulas = [s for s in sentences if _is_formula_like(s)]

    # Headings as topics
    all_headings = []
    for sec in sections:
        all_headings.extend(sec["headings"])

    if all_headings:
        parts.append("## Important Topics")
        for h in all_headings[:12]:
            parts.append(f"☑ {h}")

    if definitions:
        parts.append("\n## Definitions (Exam Critical)")
        for d in definitions[:12]:
            parts.append(f"• {d}")

    if formulas:
        parts.append("\n## Formulas & Equations")
        for f in formulas[:8]:
            parts.append(f"📐 {f}")

    if key_points:
        parts.append("\n## Key Points to Remember")
        for p in key_points[:10]:
            parts.append(f"★ {p}")

    return "\n".join(parts)


def _format_revision_notes(sections: list, sentences: list) -> str:
    parts = ["# Last-Minute Revision\n"]
    all_headings = []
    for sec in sections:
        all_headings.extend(sec["headings"])

    if all_headings:
        parts.append("## Topics at a Glance")
        for h in all_headings[:15]:
            parts.append(f"→ {h}")
        parts.append("")

    definitions = _extract_definitions(sentences)
    if definitions:
        parts.append("## Must-Know Definitions")
        for d in definitions[:8]:
            parts.append(f"• {d}")

    key_points = _extract_key_points(sentences)
    if key_points:
        parts.append("\n## Quick Points")
        for p in key_points[:8]:
            parts.append(f"✓ {p}")

    return "\n".join(parts)


# ── Public API ────────────────────────────────────────────────────────────

def generate_notes(pdf_path: str, mode: str = "study") -> dict:
    """
    Generate structured notes from PDF.
    mode: 'study' | 'exam' | 'revision'
    Returns: { "notes": str, "mode": str, "page_count": int }
    """
    data = _extract_structured(pdf_path)
    if not data["all_sentences"]:
        raise ValueError("No text could be extracted from this PDF.")

    if mode == "exam":
        notes = _format_exam_notes(data["sections"], data["all_sentences"])
    elif mode == "revision":
        notes = _format_revision_notes(data["sections"], data["all_sentences"])
    else:
        notes = _format_study_notes(data["sections"], data["all_sentences"])

    return {
        "notes": notes,
        "mode": mode,
        "page_count": len(data["sections"]),
        "heading_count": sum(len(s["headings"]) for s in data["sections"]),
        "definition_count": len(_extract_definitions(data["all_sentences"])),
    }

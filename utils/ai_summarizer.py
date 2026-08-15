"""
ai_summarizer.py — Heuristic PDF summarizer (no external API required)
Uses sentence scoring (TextRank-style + keyword weighting) to generate summaries.
"""
import re
import math
import fitz
from collections import Counter


# ── Text extraction ────────────────────────────────────────────────────────

def _extract_text_with_meta(pdf_path: str) -> dict:
    """Extract text page-by-page with heading detection."""
    doc = fitz.open(pdf_path)
    pages = []
    headings = []
    all_text = ""

    for i in range(len(doc)):
        page = doc[i]
        page_text = ""
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span["text"].strip()
                    size = span.get("size", 12)
                    if not text:
                        continue
                    if size >= 13 and len(text) > 3 and len(text) < 150:
                        headings.append({"text": text, "page": i + 1})
                    page_text += " " + text

        pages.append({"page": i + 1, "text": page_text.strip()})
        all_text += "\n" + page_text

    doc.close()
    return {"pages": pages, "headings": headings, "all_text": all_text.strip(), "page_count": len(pages)}


# ── Sentence scoring ───────────────────────────────────────────────────────

def _split_sentences(text: str) -> list:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 40]


def _word_freq(sentences: list) -> Counter:
    words = []
    for s in sentences:
        words.extend(re.findall(r'\b[a-zA-Z]{4,}\b', s.lower()))
    stop = {"this", "that", "with", "from", "have", "will", "been", "they",
            "their", "which", "about", "also", "more", "some", "each", "than",
            "into", "when", "what", "your", "there", "these", "those", "such"}
    return Counter(w for w in words if w not in stop)


def _score_sentences(sentences: list, freq: Counter) -> list:
    exam_keywords = {
        "definition", "defined", "refers", "means", "formula", "theorem",
        "important", "key", "concept", "principle", "advantage", "disadvantage",
        "difference", "example", "type", "property", "algorithm", "law", "rule",
        "equation", "note", "remember", "critical", "significant", "essential"
    }
    scored = []
    for s in sentences:
        words = re.findall(r'\b[a-zA-Z]{4,}\b', s.lower())
        freq_score = sum(freq.get(w, 0) for w in words) / (len(words) + 1)
        exam_score = sum(1 for w in words if w in exam_keywords) * 2
        length_bonus = 1.0 if 60 < len(s) < 250 else 0.5
        total = (freq_score + exam_score) * length_bonus
        scored.append((total, s))
    scored.sort(reverse=True)
    return [s for _, s in scored]


# ── Summary generators ────────────────────────────────────────────────────

def _generate_short(sentences: list, headings: list) -> str:
    top = sentences[:8]
    if headings:
        intro = f"This document covers topics including: {', '.join(h['text'] for h in headings[:5])}."
        return intro + "\n\n" + " ".join(top[:5])
    return " ".join(top[:6])


def _generate_medium(sentences: list, headings: list) -> str:
    sections = []
    if headings:
        sections.append("**Main Topics Covered:**")
        for h in headings[:8]:
            sections.append(f"• {h['text']} (Page {h['page']})")
        sections.append("")
    sections.append("**Summary:**")
    sections.append(" ".join(sentences[:12]))
    return "\n".join(sections)


def _generate_detailed(sentences: list, headings: list, pages: list) -> str:
    parts = []
    if headings:
        parts.append("## Topics & Sections\n")
        for h in headings[:12]:
            parts.append(f"**{h['text']}** — Page {h['page']}")
        parts.append("")
    parts.append("## Detailed Summary\n")
    # group top sentences into paragraphs
    top = sentences[:20]
    para = []
    for i, s in enumerate(top):
        para.append(s)
        if (i + 1) % 4 == 0:
            parts.append(" ".join(para))
            parts.append("")
            para = []
    if para:
        parts.append(" ".join(para))
    return "\n".join(parts)


def _generate_exam(sentences: list, headings: list) -> str:
    exam_patterns = [
        r'\b(is defined as|refers to|means|is a|are a|theorem|formula|law)\b',
        r'\b(advantage|disadvantage|difference|types? of|property|algorithm)\b',
        r'\b(important|key|critical|essential|significant|note that|remember)\b',
        r'[A-Z][a-z]+ (is|are|was|were) (a|an|the)\b',
    ]
    exam_sentences = []
    for s in sentences:
        if any(re.search(p, s, re.IGNORECASE) for p in exam_patterns):
            exam_sentences.append(s)

    parts = ["## Exam-Focused Summary\n"]
    if headings:
        parts.append("### Important Topics")
        for h in headings[:10]:
            parts.append(f"• **{h['text']}** (Page {h['page']})")
        parts.append("")
    parts.append("### Key Points & Definitions")
    for s in exam_sentences[:15]:
        parts.append(f"• {s}")
    if not exam_sentences:
        for s in sentences[:10]:
            parts.append(f"• {s}")
    return "\n".join(parts)


# ── Public API ────────────────────────────────────────────────────────────

def summarize_pdf(pdf_path: str, mode: str = "medium") -> dict:
    """
    Generate a summary of the PDF.
    mode: 'short' | 'medium' | 'detailed' | 'exam'
    Returns: { "summary": str, "mode": str, "page_count": int, "heading_count": int }
    """
    meta = _extract_text_with_meta(pdf_path)
    if not meta["all_text"].strip():
        raise ValueError("No text could be extracted from this PDF. It may be scanned/image-only.")

    sentences = _split_sentences(meta["all_text"])
    if not sentences:
        raise ValueError("Could not extract meaningful sentences from this PDF.")

    freq = _word_freq(sentences)
    ranked = _score_sentences(sentences, freq)

    if mode == "short":
        summary = _generate_short(ranked, meta["headings"])
    elif mode == "detailed":
        summary = _generate_detailed(ranked, meta["headings"], meta["pages"])
    elif mode == "exam":
        summary = _generate_exam(ranked, meta["headings"])
    else:
        summary = _generate_medium(ranked, meta["headings"])

    return {
        "summary": summary,
        "mode": mode,
        "page_count": meta["page_count"],
        "heading_count": len(meta["headings"]),
        "word_count": len(meta["all_text"].split()),
    }

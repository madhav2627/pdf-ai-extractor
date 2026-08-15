"""
ask_pdf.py — Keyword-based Q&A over PDF content (no external API)
Searches extracted page text for answers to student questions.
"""
import re
import fitz
from collections import defaultdict


def _extract_pages(pdf_path: str) -> list:
    """Return list of {page, text} dicts."""
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(len(doc)):
        text = doc[i].get_text("text").strip()
        pages.append({"page": i + 1, "text": text})
    doc.close()
    return pages


def _tokenize(text: str) -> set:
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "shall",
        "should", "may", "might", "must", "can", "could", "to", "of", "in",
        "on", "at", "by", "for", "with", "about", "as", "from", "that", "this",
        "these", "those", "and", "or", "but", "if", "then", "so", "because",
        "what", "which", "who", "how", "when", "where", "why", "it", "its",
    }
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    return set(w for w in words if w not in stop_words)


def _score_passage(query_tokens: set, passage: str) -> float:
    passage_tokens = _tokenize(passage)
    if not query_tokens or not passage_tokens:
        return 0.0
    intersection = query_tokens & passage_tokens
    return len(intersection) / (len(query_tokens) + 0.1)


def _split_paragraphs(text: str) -> list:
    """Split page text into paragraph-sized chunks."""
    paras = re.split(r'\n{2,}', text)
    result = []
    for p in paras:
        p = p.strip()
        if len(p) > 60:
            result.append(p)
    # If no paragraph breaks, split by sentences
    if not result and text:
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunk = []
        for s in sentences:
            chunk.append(s)
            if len(' '.join(chunk)) > 200:
                result.append(' '.join(chunk))
                chunk = []
        if chunk:
            result.append(' '.join(chunk))
    return result


def answer_question(pdf_path: str, question: str, top_k: int = 3) -> dict:
    """
    Find the most relevant passages in the PDF for the given question.
    Returns:
        {
          "question": str,
          "answers": [{"page": int, "passage": str, "score": float}],
          "found": bool
        }
    """
    pages = _extract_pages(pdf_path)
    if not any(p["text"] for p in pages):
        raise ValueError("No text could be extracted from this PDF. It may be scanned/image-only.")

    query_tokens = _tokenize(question)
    if not query_tokens:
        raise ValueError("Question is too short or contains only common words.")

    candidates = []
    for page_data in pages:
        paragraphs = _split_paragraphs(page_data["text"])
        for para in paragraphs:
            score = _score_passage(query_tokens, para)
            if score > 0:
                candidates.append({
                    "page": page_data["page"],
                    "passage": para[:600],  # truncate very long passages
                    "score": round(score, 3),
                })

    # Sort by score descending, deduplicate similar passages
    candidates.sort(key=lambda x: x["score"], reverse=True)

    seen = []
    unique = []
    for c in candidates:
        key = c["passage"][:80]
        if key not in seen:
            seen.append(key)
            unique.append(c)
        if len(unique) >= top_k:
            break

    found = bool(unique) and unique[0]["score"] > 0.1

    return {
        "question": question,
        "answers": unique,
        "found": found,
        "page_count": len(pages),
    }

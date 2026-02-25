"""
flashcard_generator.py — Generate Q&A flashcards from PDF text
Uses simple NLP heuristics (no external AI API required).
"""
import re
import fitz


def _extract_sentences(text: str) -> list:
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) > 30]


def _is_definition(sentence: str) -> bool:
    patterns = [
        r'\b(is|are|was|were|refers to|means|defined as|known as)\b',
        r'[A-Z][a-z]+ (is|are) (a|an|the)\b',
    ]
    return any(re.search(p, sentence) for p in patterns)


def _make_question(sentence: str) -> str | None:
    """Try to turn a sentence into a question."""
    # Definition pattern: "X is Y" → "What is X?"
    m = re.match(
        r'^([A-Z][^\.,]{2,40}?)\s+(is|are|was|were)\s+(.+)',
        sentence
    )
    if m:
        subject = m.group(1).strip()
        verb    = m.group(2)
        return f"What {verb} {subject}?"

    # Contains a key term in bold-like all-caps
    m = re.search(r'\b([A-Z]{3,})\b', sentence)
    if m:
        term = m.group(1).title()
        return f"What does {term} refer to?"

    return None


def generate_flashcards(pdf_path: str, max_cards: int = 20) -> dict:
    """
    Extract text and generate Q&A flashcard pairs.
    Returns { "cards": [{"q": str, "a": str}], "count": int }
    """
    doc = fitz.open(pdf_path)
    all_text = ""
    headings = []

    for i in range(len(doc)):
        page = doc[i]
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
                    # Detect headings by font size
                    if size >= 14 and len(text) > 4 and len(text) < 120:
                        headings.append(text)
                    all_text += " " + text

    doc.close()

    cards = []

    # Heading-based cards
    for h in headings[:max_cards // 2]:
        cards.append({
            "q": f"What is '{h}'?",
            "a": f"(Refer to the section titled '{h}' in your PDF)"
        })

    # Sentence-based cards
    sentences = _extract_sentences(all_text)
    for sent in sentences:
        if len(cards) >= max_cards:
            break
        if _is_definition(sent):
            q = _make_question(sent)
            if q:
                cards.append({"q": q, "a": sent})

    # Deduplicate
    seen = set()
    unique = []
    for c in cards:
        key = c["q"]
        if key not in seen:
            seen.add(key)
            unique.append(c)

    unique = unique[:max_cards]

    if not unique:
        raise ValueError("Could not generate flashcards. Try a text-rich PDF.")

    return {"cards": unique, "count": len(unique)}
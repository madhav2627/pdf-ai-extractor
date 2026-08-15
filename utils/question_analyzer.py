"""
question_analyzer.py — Analyze question papers to find frequently appearing topics (no external API)
Uses term frequency and n-gram analysis to detect repeated concepts.
"""
import re
import fitz
from collections import Counter, defaultdict


STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "must", "can", "could", "to", "of", "in",
    "on", "at", "by", "for", "with", "about", "as", "from", "that", "this",
    "these", "those", "and", "or", "but", "if", "then", "so", "because",
    "what", "which", "who", "how", "when", "where", "why", "it", "its",
    "all", "any", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "than", "too",
    "very", "just", "each", "every", "answer", "question", "marks", "mark",
    "short", "long", "write", "explain", "define", "discuss", "list",
    "describe", "state", "give", "following", "unit", "module", "part",
    "section", "chapter", "total", "maximum", "minimum", "time", "date",
    "page", "exam", "examination", "test", "paper", "year"
}


def _extract_text_by_page(pdf_path: str) -> list:
    doc = fitz.open(pdf_path)
    pages = []
    for i in range(len(doc)):
        text = doc[i].get_text("text").strip()
        pages.append({"page": i + 1, "text": text})
    doc.close()
    return pages


def _extract_keywords(text: str) -> list:
    """Extract meaningful keywords from text."""
    words = re.findall(r'\b[A-Za-z][a-z]{2,}\b', text)
    return [w.lower() for w in words if w.lower() not in STOP_WORDS and len(w) > 3]


def _extract_bigrams(keywords: list) -> list:
    """Generate bigrams from keywords."""
    return [f"{keywords[i]} {keywords[i+1]}" for i in range(len(keywords)-1)]


def _detect_questions(text: str) -> list:
    """Extract question-like sentences from text."""
    questions = []
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        # Lines ending with ? or numbered question format
        if line.endswith('?') and len(line) > 20:
            questions.append(line)
        elif re.match(r'^(\d+[\.\)]\s+|\([a-zA-Z]\)\s+|[QqAa][\.\d]*[\.\)]\s+)', line) and len(line) > 20:
            questions.append(line)
    return questions


def analyze_question_paper(pdf_path: str) -> dict:
    """
    Analyze a question paper PDF to find frequently appearing topics.
    Returns:
        {
          "frequent_topics": [{"topic": str, "frequency": int}],
          "repeated_questions": [str],
          "chapter_distribution": {"chapter": count},
          "keyword_cloud": [{"word": str, "count": int}],
          "page_count": int,
          "question_count": int,
        }
    """
    pages = _extract_text_by_page(pdf_path)
    if not any(p["text"] for p in pages):
        raise ValueError("No text could be extracted from this PDF.")

    full_text = "\n".join(p["text"] for p in pages)
    all_keywords = _extract_keywords(full_text)
    all_bigrams = _extract_bigrams(all_keywords)

    # Count word and bigram frequencies
    word_freq = Counter(all_keywords)
    bigram_freq = Counter(all_bigrams)

    # Top keywords (min 2 occurrences)
    top_keywords = [
        {"word": w, "count": c}
        for w, c in word_freq.most_common(30)
        if c >= 2
    ]

    # Top bigrams as "topics"
    top_bigrams = [
        {"topic": b.title(), "frequency": c}
        for b, c in bigram_freq.most_common(20)
        if c >= 2
    ]

    # Detect chapter mentions
    chapter_pattern = re.compile(r'(chapter|unit|module|section)\s*[\d]+', re.IGNORECASE)
    chapter_matches = chapter_pattern.findall(full_text)
    chapter_dist = defaultdict(int)
    for cm in chapter_matches:
        chapter_dist[cm.strip().title()] += 1

    # Detect repeated questions
    all_questions = []
    for p in pages:
        all_questions.extend(_detect_questions(p["text"]))

    # Find questions that appear on multiple pages (simplified: very similar length + keywords)
    question_counter = Counter()
    for q in all_questions:
        key = frozenset(_extract_keywords(q))
        question_counter[key] += 1

    repeated = []
    for q in all_questions:
        key = frozenset(_extract_keywords(q))
        if question_counter[key] > 1:
            repeated.append(q)

    repeated = list(dict.fromkeys(repeated))[:10]  # deduplicate, limit to 10

    # Importance classification for topics
    for t in top_bigrams:
        f = t["frequency"]
        if f >= 5:
            t["importance"] = "High"
        elif f >= 3:
            t["importance"] = "Medium"
        else:
            t["importance"] = "Low"

    return {
        "frequent_topics": top_bigrams,
        "repeated_questions": repeated,
        "chapter_distribution": dict(chapter_dist),
        "keyword_cloud": top_keywords,
        "page_count": len(pages),
        "question_count": len(all_questions),
    }

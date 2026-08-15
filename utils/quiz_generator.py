"""
quiz_generator.py — Generate MCQ and True/False questions from PDFs (no external API)
Uses definition/fact sentence patterns to create questions with distractors.
"""
import re
import random
import fitz
from collections import defaultdict


def _extract_sentences_by_page(pdf_path: str) -> list:
    """Extract sentences with page references."""
    doc = fitz.open(pdf_path)
    result = []
    for i in range(len(doc)):
        text = doc[i].get_text("text").strip()
        sentences = re.split(r'(?<=[.!?])\s+', text)
        for s in sentences:
            s = s.strip()
            if len(s) > 50:
                result.append({"sentence": s, "page": i + 1})
    doc.close()
    return result


def _is_factual(s: str) -> bool:
    """Check if sentence looks like a factual statement suitable for quizzing."""
    patterns = [
        r'\b(is defined as|refers to|means|is a|is an|is the)\b',
        r'\b(was invented|was discovered|was created|was developed)\b',
        r'\b(consists of|composed of|made up of|contains)\b',
        r'\b(advantage|disadvantage|property|feature|characteristic)\b',
        r'[A-Z][a-z]{2,}\s+(is|are|was|were)\s+\w',
    ]
    return any(re.search(p, s, re.IGNORECASE) for p in patterns)


def _extract_subject(sentence: str) -> str | None:
    """Extract the subject of a factual sentence."""
    m = re.match(r'^([A-Z][a-zA-Z\s\-]{2,40}?)\s+(is|are|was|were|refers|means|consists)', sentence)
    if m:
        return m.group(1).strip()
    return None


def _make_mcq(entry: dict, all_entries: list) -> dict | None:
    """Create a multiple-choice question from a sentence."""
    s = entry["sentence"]
    subject = _extract_subject(s)
    if not subject:
        return None

    # Build answer: the full sentence IS the answer
    correct = s

    # Build distractors from other sentences
    pool = [e["sentence"] for e in all_entries if e != entry and len(e["sentence"]) > 40]
    random.shuffle(pool)
    distractors = pool[:3]

    if len(distractors) < 2:
        return None

    options = distractors[:3] + [correct]
    random.shuffle(options)
    correct_idx = options.index(correct)

    # Truncate long options
    options = [o[:180] + "…" if len(o) > 180 else o for o in options]
    question = f"Which of the following best describes '{subject}'?"

    return {
        "type": "mcq",
        "question": question,
        "options": options,
        "correct": correct_idx,
        "explanation": correct[:200] + ("…" if len(correct) > 200 else ""),
        "page": entry["page"],
    }


def _make_truefalse(entry: dict, all_entries: list) -> dict:
    """Create a True/False question."""
    s = entry["sentence"][:200]
    # 50% chance to negate with a distractor
    negate = random.random() > 0.5
    if negate:
        # Replace part of sentence with something wrong
        pool = [e["sentence"][:60] for e in all_entries if e != entry]
        if pool:
            fake = random.choice(pool)
            subject = _extract_subject(s)
            if subject:
                question = s.replace(subject, fake[:40], 1)
                answer = False
            else:
                question = s
                answer = True
        else:
            question = s
            answer = True
    else:
        question = s
        answer = True

    return {
        "type": "truefalse",
        "question": question,
        "options": ["True", "False"],
        "correct": 0 if answer else 1,
        "explanation": entry["sentence"][:200] + ("…" if len(entry["sentence"]) > 200 else ""),
        "page": entry["page"],
    }


def _make_fillinblank(entry: dict) -> dict | None:
    """Create a fill-in-the-blank question by blanking a key term."""
    s = entry["sentence"]
    subject = _extract_subject(s)
    if not subject or len(subject) < 3:
        return None

    blanked = s.replace(subject, "_____", 1)

    return {
        "type": "fillblank",
        "question": f"Fill in the blank: {blanked}",
        "options": [],
        "correct": subject,
        "explanation": s[:200] + ("…" if len(s) > 200 else ""),
        "page": entry["page"],
    }


def generate_quiz(pdf_path: str, count: int = 10, difficulty: str = "medium",
                  q_type: str = "mcq") -> dict:
    """
    Generate a quiz from a PDF.
    count: number of questions
    difficulty: 'easy' | 'medium' | 'hard' | 'exam'
    q_type: 'mcq' | 'truefalse' | 'fillblank' | 'mixed'
    """
    count = max(3, min(30, count))
    entries = _extract_sentences_by_page(pdf_path)
    factual = [e for e in entries if _is_factual(e["sentence"])]

    if not factual:
        # Fall back to any sentences
        factual = [e for e in entries if len(e["sentence"]) > 60]

    if not factual:
        raise ValueError("Could not extract enough content to generate quiz questions.")

    # Adjust pool by difficulty
    if difficulty == "easy":
        pool = factual[:len(factual)//2] if len(factual) > 6 else factual
    elif difficulty in ("hard", "exam"):
        pool = factual  # use all, harder selection
    else:
        pool = factual

    random.shuffle(pool)

    questions = []
    attempts = pool[:count * 3]  # try 3x to hit target count

    for entry in attempts:
        if len(questions) >= count:
            break

        if q_type == "mcq":
            q = _make_mcq(entry, pool)
        elif q_type == "truefalse":
            q = _make_truefalse(entry, pool)
        elif q_type == "fillblank":
            q = _make_fillinblank(entry)
        else:
            # mixed
            r = random.random()
            if r < 0.5:
                q = _make_mcq(entry, pool)
            elif r < 0.75:
                q = _make_truefalse(entry, pool)
            else:
                q = _make_fillinblank(entry)

        if q:
            questions.append(q)

    if not questions:
        raise ValueError("Could not generate quiz questions from this PDF. Try a text-rich PDF.")

    return {
        "questions": questions,
        "count": len(questions),
        "difficulty": difficulty,
        "type": q_type,
    }

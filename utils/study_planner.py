"""
study_planner.py — Generate a day-by-day study plan from a PDF (no external API)
Detects chapters/units from headings and distributes across available days.
"""
import re
import math
import fitz
from datetime import datetime, timedelta


def _extract_chapters(pdf_path: str) -> list:
    """Detect chapter/unit headings from the PDF."""
    doc = fitz.open(pdf_path)
    chapters = []
    chapter_pattern = re.compile(
        r'^(chapter|unit|module|section|part)\s*[\d]+[\s:\-—]*.{0,60}$',
        re.IGNORECASE
    )
    heading_pattern = re.compile(r'^[A-Z][A-Z\s\d\-:]{5,60}$')

    for i in range(len(doc)):
        page = doc[i]
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_text = " ".join(
                    span["text"] for span in line.get("spans", [])
                    if span["text"].strip()
                ).strip()

                max_size = max(
                    (span.get("size", 12) for span in line.get("spans", [])
                     if span["text"].strip()),
                    default=12
                )

                if not line_text or len(line_text) < 4:
                    continue

                is_chapter = chapter_pattern.match(line_text)
                is_heading = max_size >= 14 and len(line_text) < 100

                if is_chapter or is_heading:
                    chapters.append({
                        "title": line_text,
                        "page": i + 1,
                        "is_chapter": bool(is_chapter),
                    })

    doc.close()

    # Deduplicate very similar headings
    seen = set()
    unique = []
    for c in chapters:
        key = c["title"].lower()[:40]
        if key not in seen:
            seen.add(key)
            unique.append(c)

    return unique


def _estimate_hours(page_count: int, chapter_count: int) -> float:
    """Rough estimate: 1 page = ~3 minutes of study."""
    total_minutes = page_count * 3
    return total_minutes / 60


def generate_study_plan(pdf_path: str, exam_date: str = None,
                         hours_per_day: float = 3.0,
                         total_days: int = None) -> dict:
    """
    Generate a study plan from a PDF.
    exam_date: 'YYYY-MM-DD' string (optional)
    hours_per_day: study hours available per day
    total_days: override number of days if exam_date not given
    """
    doc = fitz.open(pdf_path)
    page_count = len(doc)
    doc.close()

    chapters = _extract_chapters(pdf_path)

    # Determine number of days
    if exam_date:
        try:
            exam_dt = datetime.strptime(exam_date, "%Y-%m-%d")
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            days_left = (exam_dt - today).days
            if days_left < 1:
                days_left = 7  # fallback
        except ValueError:
            days_left = total_days or 7
    else:
        days_left = total_days or 7

    days_left = max(1, min(days_left, 60))

    # Use chapters if found, otherwise estimate sections
    if chapters and len(chapters) >= 2:
        study_items = chapters
    else:
        # Estimate synthetic sections from page count
        est_chapters = max(3, min(15, page_count // 8))
        study_items = [
            {"title": f"Section {i+1}", "page": (i * page_count // est_chapters) + 1, "is_chapter": True}
            for i in range(est_chapters)
        ]

    total_hours = _estimate_hours(page_count, len(study_items))
    hours_per_day = max(0.5, min(12.0, hours_per_day))

    # Reserve last 2 days (or 20%) for revision/quizzes
    revision_days = max(1, int(days_left * 0.2))
    study_days = days_left - revision_days

    # Distribute chapters across study days
    plan = []
    items_per_day = max(1, math.ceil(len(study_items) / study_days))

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    day_idx = 0

    for i in range(0, len(study_items), items_per_day):
        day_items = study_items[i:i + items_per_day]
        plan_date = today + timedelta(days=day_idx)
        day_idx += 1
        plan.append({
            "day": day_idx,
            "date": plan_date.strftime("%a, %b %d"),
            "topics": [it["title"] for it in day_items],
            "pages": f"~{day_items[0]['page']}–{day_items[-1]['page'] + 5}",
            "hours": round(hours_per_day * 0.8, 1),
            "type": "study",
        })
        if day_idx >= study_days:
            break

    # Add revision days
    for r in range(revision_days):
        plan_date = today + timedelta(days=day_idx)
        day_idx += 1
        label = "Revision + Practice Quiz" if r < revision_days - 1 else "Final Revision & Mock Test"
        plan.append({
            "day": day_idx,
            "date": plan_date.strftime("%a, %b %d"),
            "topics": [label],
            "pages": "All pages",
            "hours": round(hours_per_day * 0.6, 1),
            "type": "revision",
        })

    return {
        "plan": plan,
        "total_days": len(plan),
        "exam_date": exam_date,
        "hours_per_day": hours_per_day,
        "chapter_count": len(study_items),
        "page_count": page_count,
        "estimated_total_hours": round(total_hours, 1),
    }

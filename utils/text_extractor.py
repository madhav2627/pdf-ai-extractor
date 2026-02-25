"""
text_extractor.py — Extract text from PDFs using PyMuPDF
"""
import fitz


def extract_text(pdf_path: str) -> dict:
    """
    Extract all text from a PDF, page by page.
    Returns { "full_text": str, "pages": [{"page": int, "text": str}], "page_count": int }
    """
    doc = fitz.open(pdf_path)
    pages = []
    full_parts = []

    for i in range(len(doc)):
        page = doc[i]
        text = page.get_text("text").strip()
        pages.append({"page": i + 1, "text": text})
        if text:
            full_parts.append(f"--- Page {i + 1} ---\n{text}")

    doc.close()
    full_text = "\n\n".join(full_parts)

    if not full_text.strip():
        raise ValueError("No text could be extracted. The PDF may be image-only.")

    return {
        "full_text": full_text,
        "pages": pages,
        "page_count": len(pages),
        "char_count": len(full_text),
        "word_count": len(full_text.split()),
    }
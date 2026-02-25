"""
ocr_processor.py — OCR on images using pytesseract
"""
import io
import fitz
from PIL import Image

try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r'E:\ProgramFiles\tesseract.exe'
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


def ocr_pdf(pdf_path: str) -> dict:
    """
    Render each PDF page as an image and run OCR.
    Returns { "full_text": str, "pages": [...], "page_count": int }
    """
    if not OCR_AVAILABLE:
        raise RuntimeError("pytesseract is not installed. Run: pip install pytesseract")

    doc = fitz.open(pdf_path)
    pages = []
    full_parts = []

    for i in range(len(doc)):
        page = doc[i]
        # Render at 200 DPI for good OCR accuracy
        matrix = fitz.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=matrix)
        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        if img.mode == "RGBA":
            img = img.convert("RGB")

        text = pytesseract.image_to_string(img, lang="eng").strip()
        pages.append({"page": i + 1, "text": text})
        if text:
            full_parts.append(f"--- Page {i + 1} ---\n{text}")

    doc.close()
    full_text = "\n\n".join(full_parts)

    return {
        "full_text": full_text,
        "pages": pages,
        "page_count": len(pages),
        "word_count": len(full_text.split()),
    }
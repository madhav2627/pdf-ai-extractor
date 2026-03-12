"""
converter.py — Universal File Conversion Engine
================================================
Supported conversions:
  PDF  → DOCX, TXT, Images (ZIP)
  DOCX → PDF
  TXT  → PDF
  JPG/PNG → PDF
  JPG/PNG → TXT  (OCR via Tesseract)

All public functions return:
  {"ok": True,  "path": "/abs/path/to/output", "filename": "result.xyz"}
  {"ok": False, "error": "human-readable message"}
"""

import io
import os
import re
import uuid
import zipfile
import logging
import tempfile
from pathlib import Path

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

log = logging.getLogger(__name__)

# ── Temporary output directory ─────────────────────────────────────────────
TEMP_DIR = Path(tempfile.gettempdir()) / "student_pdf_toolkit_conversions"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ── File-size ceiling: 50 MB ───────────────────────────────────────────────
MAX_BYTES = 200 * 1024 * 1024

# ── MIME / extension maps ──────────────────────────────────────────────────
ALLOWED_INPUT_EXTENSIONS = {".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png"}

OUTPUT_FORMATS: dict[str, list[str]] = {
    ".pdf":  ["docx", "txt", "images"],
    ".docx": ["pdf"],
    ".txt":  ["pdf"],
    ".jpg":  ["pdf", "txt"],
    ".jpeg": ["pdf", "txt"],
    ".png":  ["pdf", "txt"],
}


# ══════════════════════════════════════════════════════════════════════════════
#  Public helpers
# ══════════════════════════════════════════════════════════════════════════════

def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_INPUT_EXTENSIONS


def valid_output_formats(filename: str) -> list[str]:
    ext = Path(filename).suffix.lower()
    return OUTPUT_FORMATS.get(ext, [])


def convert(input_path: str, output_format: str) -> dict:
    """
    Master dispatcher.
    input_path    — absolute path to the uploaded file (already saved to disk)
    output_format — one of: docx, txt, images, pdf
    """
    src = Path(input_path)
    ext = src.suffix.lower()

    # Validate size
    if src.stat().st_size > MAX_BYTES:
        return _err("File exceeds the 50 MB limit.")

    # Validate format combination
    allowed = OUTPUT_FORMATS.get(ext, [])
    if output_format not in allowed:
        return _err(
            f"Cannot convert {ext.lstrip('.')} → {output_format}. "
            f"Allowed targets: {', '.join(allowed) or 'none'}."
        )

    try:
        dispatch = {
            (".pdf",  "docx"):   _pdf_to_docx,
            (".pdf",  "txt"):    _pdf_to_txt,
            (".pdf",  "images"): _pdf_to_images,
            (".docx", "pdf"):    _docx_to_pdf,
            (".txt",  "pdf"):    _txt_to_pdf,
            (".jpg",  "pdf"):    _image_to_pdf,
            (".jpeg", "pdf"):    _image_to_pdf,
            (".png",  "pdf"):    _image_to_pdf,
            (".jpg",  "txt"):    _image_to_txt,
            (".jpeg", "txt"):    _image_to_txt,
            (".png",  "txt"):    _image_to_txt,
        }
        fn = dispatch.get((ext, output_format))
        if fn is None:
            return _err("Unsupported conversion combination.")
        return fn(src)

    except Exception as exc:
        log.exception("Conversion failed: %s → %s", input_path, output_format)
        return _err(f"Conversion failed: {exc}")


def cleanup(path: str):
    """Delete a temporary output file after it has been sent to the client."""
    try:
        p = Path(path)
        if p.exists() and str(TEMP_DIR) in str(p.resolve()):
            p.unlink()
    except OSError:
        pass


# ══════════════════════════════════════════════════════════════════════════════
#  Conversion implementations
# ══════════════════════════════════════════════════════════════════════════════

# ── PDF → DOCX ────────────────────────────────────────────────────────────
def _pdf_to_docx(src: Path) -> dict:
    try:
        from pdf2docx import Converter as Pdf2DocxConverter
    except ImportError:
        return _err("pdf2docx is not installed. Run: pip install pdf2docx")

    out = _tmp_path(src.stem, ".docx")
    cv  = Pdf2DocxConverter(str(src))
    try:
        cv.convert(str(out), multi_processing=False)
    finally:
        cv.close()
    return _ok(out)


# ── PDF → TXT ─────────────────────────────────────────────────────────────
def _pdf_to_txt(src: Path) -> dict:
    try:
        import PyPDF2
    except ImportError:
        return _err("PyPDF2 is not installed. Run: pip install PyPDF2")

    out  = _tmp_path(src.stem, ".txt")
    text = []

    with open(src, "rb") as fh:
        reader = PyPDF2.PdfReader(fh)
        if not reader.pages:
            return _err("The PDF has no readable pages.")
        for page in reader.pages:
            content = page.extract_text()
            if content:
                text.append(content.strip())

    if not any(text):
        return _err(
            "No selectable text found. "
            "This may be a scanned PDF — try OCR conversion instead."
        )

    out.write_text("\n\n".join(text), encoding="utf-8")
    return _ok(out)


# ── PDF → Images (ZIP of PNGs) ────────────────────────────────────────────
def _pdf_to_images(src: Path) -> dict:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return _err("PyMuPDF is not installed. Run: pip install PyMuPDF")

    out_zip = _tmp_path(src.stem + "_images", ".zip")
    doc     = fitz.open(str(src))

    if len(doc) == 0:
        return _err("The PDF has no pages.")

    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, page in enumerate(doc, start=1):
            mat = fitz.Matrix(2, 2)          # 144 DPI
            pix = page.get_pixmap(matrix=mat)
            buf = io.BytesIO(pix.tobytes("png"))
            zf.writestr(f"page_{i:03d}.png", buf.getvalue())

    doc.close()
    return _ok(out_zip)


# ── DOCX → PDF ────────────────────────────────────────────────────────────
def _docx_to_pdf(src: Path) -> dict:
    """
    Strategy: extract text + basic formatting from the DOCX using python-docx,
    then render a clean PDF via ReportLab.  This avoids the LibreOffice
    dependency while still producing a readable, well-formatted PDF.
    """
    try:
        from docx import Document
    except ImportError:
        return _err("python-docx is not installed. Run: pip install python-docx")

    doc  = Document(str(src))
    out  = _tmp_path(src.stem, ".pdf")

    styles      = getSampleStyleSheet()
    body_style  = ParagraphStyle(
        "Body", parent=styles["Normal"],
        fontSize=11, leading=16, spaceAfter=4,
    )
    h1_style = ParagraphStyle(
        "H1", parent=styles["Heading1"],
        fontSize=16, leading=22, spaceBefore=14, spaceAfter=6,
    )
    h2_style = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontSize=13, leading=18, spaceBefore=10, spaceAfter=4,
    )

    def _para_style(p):
        s = p.style.name.lower()
        if "heading 1" in s:
            return h1_style
        if "heading 2" in s:
            return h2_style
        return body_style

    elements = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            elements.append(Spacer(1, 6))
            continue
        # Escape XML special characters for ReportLab
        safe = (text.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;"))
        elements.append(Paragraph(safe, _para_style(para)))

    pdf_doc = SimpleDocTemplate(
        str(out),
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2.5*cm,
    )
    pdf_doc.build(elements)
    return _ok(out)


# ── TXT → PDF ─────────────────────────────────────────────────────────────
def _txt_to_pdf(src: Path) -> dict:
    raw  = src.read_text(encoding="utf-8", errors="replace")
    out  = _tmp_path(src.stem, ".pdf")

    styles     = getSampleStyleSheet()
    code_style = ParagraphStyle(
        "Code", parent=styles["Normal"],
        fontName="Courier", fontSize=10, leading=14,
    )

    elements = []
    for line in raw.splitlines():
        safe = (line.replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;"))
        elements.append(Paragraph(safe or "&nbsp;", code_style))

    pdf_doc = SimpleDocTemplate(
        str(out), pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2.5*cm,
    )
    pdf_doc.build(elements)
    return _ok(out)


# ── JPG/PNG → PDF ─────────────────────────────────────────────────────────
def _image_to_pdf(src: Path) -> dict:
    out = _tmp_path(src.stem, ".pdf")
    img = Image.open(src).convert("RGB")

    # Scale to fit A4 at 96 DPI while keeping aspect ratio
    a4_w_px, a4_h_px = 794, 1123
    img.thumbnail((a4_w_px, a4_h_px), Image.LANCZOS)

    img.save(str(out), "PDF", resolution=96)
    return _ok(out)


# ── JPG/PNG → TXT (OCR) ───────────────────────────────────────────────────
def _image_to_txt(src: Path) -> dict:
    out = _tmp_path(src.stem + "_ocr", ".txt")

    img  = Image.open(src)
    text = pytesseract.image_to_string(img, lang="eng")

    if not text.strip():
        return _err(
            "No text could be detected in the image. "
            "Make sure the image contains printed or typed text."
        )

    out.write_text(text, encoding="utf-8")
    return _ok(out)


# ══════════════════════════════════════════════════════════════════════════════
#  Internal utilities
# ══════════════════════════════════════════════════════════════════════════════

def _tmp_path(stem: str, suffix: str) -> Path:
    """Return a unique path inside TEMP_DIR."""
    safe_stem = re.sub(r"[^\w\-]", "_", stem)[:60]
    uid       = uuid.uuid4().hex[:8]
    return TEMP_DIR / f"{safe_stem}_{uid}{suffix}"


def _ok(path: Path) -> dict:
    return {"ok": True, "path": str(path), "filename": path.name}


def _err(msg: str) -> dict:
    return {"ok": False, "error": msg}
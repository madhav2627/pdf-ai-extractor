"""
pdf_compressor.py — Reduce PDF file size by re-rendering pages at lower DPI
"""
import io
import os
import fitz
from PIL import Image
import config


def compress_pdf(input_path: str, output_path: str, quality: str = "medium") -> dict:
    """
    Compress a PDF by re-rendering each page as a JPEG at reduced DPI.
    quality: "low" | "medium" | "high"
    Returns info dict with original_size, compressed_size, ratio.
    """
    SETTINGS = {
        "low":    {"dpi": 72,  "jpeg_q": 40},
        "medium": {"dpi": 96,  "jpeg_q": 60},
        "high":   {"dpi": 120, "jpeg_q": 75},
    }
    s = SETTINGS.get(quality, SETTINGS["medium"])
    dpi, jpeg_q = s["dpi"], s["jpeg_q"]
    scale = dpi / 72.0

    original_size = os.path.getsize(input_path)
    doc = fitz.open(input_path)
    out = fitz.open()

    for i in range(len(doc)):
        page = doc[i]
        matrix = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=matrix)

        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        if img.mode != "RGB":
            img = img.convert("RGB")

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=jpeg_q, optimize=True)
        buf.seek(0)

        # Create a new page the same display size as original
        rect = page.rect
        new_page = out.new_page(width=rect.width, height=rect.height)
        new_page.insert_image(rect, stream=buf.read())

    out.save(output_path, deflate=True, garbage=4)
    out.close()
    doc.close()

    compressed_size = os.path.getsize(output_path)
    ratio = (1 - compressed_size / original_size) * 100 if original_size else 0

    return {
        "original_size":    original_size,
        "compressed_size":  compressed_size,
        "original_kb":      round(original_size / 1024, 1),
        "compressed_kb":    round(compressed_size / 1024, 1),
        "reduction_pct":    round(ratio, 1),
        "quality":          quality,
    }
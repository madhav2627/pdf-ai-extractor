import os
import fitz  # PyMuPDF
from PIL import Image


def extract_images_to_pdf(input_pdf_path, output_pdf_path, images_per_page=1):
    """
    Extracts all images from a PDF and writes them into a new PDF.
    - Pulls embedded images where available
    - Falls back to full-page rendering for scanned PDFs
    - Lays out `images_per_page` images per output page
    """

    images = _extract_images(input_pdf_path)

    if not images:
        raise ValueError("No images could be extracted from the PDF.")

    _build_pdf(images, output_pdf_path, images_per_page)


# ─────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────


# ── Tunable thresholds ───────────────────────────────────────────────────────
MIN_WIDTH       = 150   # pixels  – ignore tiny icons / bullets
MIN_HEIGHT      = 150   # pixels
MIN_AREA        = 30_000  # px²   – extra guard for near-square thumbnails
MAX_ASPECT      = 8.0   # w/h or h/w – ignore thin decorative bars / dividers
# ─────────────────────────────────────────────────────────────────────────────


def _is_meaningful(pil_img: Image.Image) -> bool:
    """Return True only if the image is large and well-proportioned enough."""
    w, h = pil_img.size
    if w < MIN_WIDTH or h < MIN_HEIGHT:
        return False
    if w * h < MIN_AREA:
        return False
    aspect = max(w, h) / max(min(w, h), 1)
    if aspect > MAX_ASPECT:
        return False
    return True


def _extract_images(pdf_path):
    """Return a list of PIL Images extracted from the PDF."""
    doc = fitz.open(pdf_path)
    pil_images = []
    seen_xrefs = set()   # deduplicate – same xref can appear on many pages

    for page_number in range(len(doc)):
        page = doc[page_number]
        image_list = page.get_images(full=True)

        if image_list:
            # ── Embedded images ──────────────────────────
            page_imgs = []
            for img in image_list:
                xref = img[0]
                if xref in seen_xrefs:
                    continue                  # skip duplicates
                seen_xrefs.add(xref)

                try:
                    pix = fitz.Pixmap(doc, xref)

                    # Convert CMYK or other exotic colour spaces → RGB
                    if pix.n > 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)

                    mode = "RGBA" if pix.alpha else "RGB"
                    pil_img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)

                    if pil_img.mode == "RGBA":
                        pil_img = pil_img.convert("RGB")

                    # ── Size / aspect filter ──────────────
                    if not _is_meaningful(pil_img):
                        continue

                    page_imgs.append(pil_img)
                except Exception:
                    continue

            if page_imgs:
                pil_images.extend(page_imgs)
            # else: all embedded images were tiny icons and got filtered — skip page

        else:
            # ── No embedded images — check if this is a scanned page ──
            # A scanned PDF page has no selectable text; a text-only page does.
            # Only render pages that are truly scanned (empty text layer).
            page_text = page.get_text().strip()
            if page_text:
                # This is a text-only page — skip it, the user wants images only
                continue

            # Genuinely scanned page (no text, no embedded images) → render it
            matrix = fitz.Matrix(2, 2)  # ~144 DPI
            pix = page.get_pixmap(matrix=matrix)
            mode = "RGBA" if pix.alpha else "RGB"
            pil_img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
            if pil_img.mode == "RGBA":
                pil_img = pil_img.convert("RGB")
            pil_images.append(pil_img)

    doc.close()
    return pil_images


def _build_pdf(images, output_path, images_per_page):
    """
    Pack `images` into a new PDF with `images_per_page` per page.
    Each output page is A4 landscape when 2+ images, A4 portrait for 1.
    """

    A4_W, A4_H = 595, 842  # points

    if images_per_page > 1:
        page_w, page_h = A4_H, A4_W   # landscape
    else:
        page_w, page_h = A4_W, A4_H   # portrait

    doc = fitz.open()
    MARGIN = 10

    # Split images into chunks of `images_per_page`
    chunks = [images[i:i + images_per_page] for i in range(0, len(images), images_per_page)]

    for chunk in chunks:
        page = doc.new_page(width=page_w, height=page_h)
        n = len(chunk)

        if images_per_page == 1 or n == 1:
            cols, rows = 1, 1
        elif images_per_page == 2:
            cols, rows = 2, 1
        elif images_per_page <= 4:
            cols, rows = 2, 2
        elif images_per_page <= 6:
            cols, rows = 3, 2
        else:
            cols, rows = 3, 3

        cell_w = (page_w - MARGIN * (cols + 1)) / cols
        cell_h = (page_h - MARGIN * (rows + 1)) / rows

        for idx, img in enumerate(chunk):
            col = idx % cols
            row = idx // cols

            x0 = MARGIN + col * (cell_w + MARGIN)
            y0 = MARGIN + row * (cell_h + MARGIN)
            x1 = x0 + cell_w
            y1 = y0 + cell_h

            # Scale image to fit cell while keeping aspect ratio
            iw, ih = img.size
            scale = min(cell_w / iw, cell_h / ih)
            new_w = iw * scale
            new_h = ih * scale

            # Centre inside cell
            cx = x0 + (cell_w - new_w) / 2
            cy = y0 + (cell_h - new_h) / 2

            rect = fitz.Rect(cx, cy, cx + new_w, cy + new_h)

            # Write PIL image into fitz
            import io
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            page.insert_image(rect, stream=buf.read())

    doc.save(output_path)
    doc.close()
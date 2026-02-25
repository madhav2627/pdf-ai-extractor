"""
pdf_processor.py
─────────────────
Public API
  extract_and_build(input_pdf_path, output_pdf_path,
                    images_per_page=1, enhance=False)
      → list[str]   base-64 JPEG data-URI thumbnail strings

  extract_images_only(input_pdf_path)
      → list[PIL.Image]   raw extracted images
"""

import io
import base64

import fitz          # PyMuPDF
from PIL import Image, ImageStat

import config
from utils.image_enhancer import enhance_image


# ── Public entry point ─────────────────────────────────────────────────────

def extract_and_build(input_pdf_path, output_pdf_path,
                      images_per_page=1, enhance=False):
    images = _extract_images(input_pdf_path)

    if not images:
        raise ValueError("No images could be extracted from the PDF.")

    if enhance:
        images = _enhance_all(images)

    _build_pdf(images, output_pdf_path, images_per_page)

    return _make_thumbnails(images)


def extract_images_only(input_pdf_path):
    return _extract_images(input_pdf_path)


# ── Enhancement ────────────────────────────────────────────────────────────

def _enhance_all(images):
    enhanced = []
    for img in images:
        try:
            enhanced.append(
                enhance_image(img, upscale=config.ENHANCE_UPSCALE)
            )
        except Exception:
            enhanced.append(img)
    return enhanced


# ── Thumbnail generation ───────────────────────────────────────────────────

def _make_thumbnails(images):
    data_uris = []
    for img in images:
        try:
            thumb = img.copy()
            if thumb.mode != "RGB":
                thumb = thumb.convert("RGB")
            thumb.thumbnail(config.THUMBNAIL_SIZE, Image.LANCZOS)
            buf = io.BytesIO()
            thumb.save(buf, format="JPEG", quality=config.THUMBNAIL_QUALITY,
                       optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode()
            data_uris.append(f"data:image/jpeg;base64,{b64}")
        except Exception:
            continue
    return data_uris


# ── Image extraction ───────────────────────────────────────────────────────

def _is_meaningful(pil_img: Image.Image) -> bool:
    """
    Return True only if the image passes size / aspect-ratio thresholds
    AND is not a solid-color background (e.g., black rectangles).
    """
    w, h = pil_img.size

    # Existing size filters (UNCHANGED)
    if w < config.MIN_WIDTH or h < config.MIN_HEIGHT:
        return False
    if w * h < config.MIN_AREA:
        return False

    aspect = max(w, h) / max(min(w, h), 1)
    if aspect > config.MAX_ASPECT:
        return False

    # 🆕 NEW: Reject solid-color images (black boxes, masks, fills)
    try:
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        stat = ImageStat.Stat(pil_img)
        variance = sum(stat.var)

        # very low variance → solid color
        if variance < 5:
            return False

        # near-black or near-white average → background fill
        avg = sum(stat.mean) / 3
        if avg < 10 or avg > 245:
            return False

    except Exception:
        pass

    return True


def _extract_images(pdf_path):
    doc = fitz.open(pdf_path)
    pil_images = []
    seen_xrefs = set()

    for page_number in range(len(doc)):
        page     = doc[page_number]
        img_list = page.get_images(full=True)

        if img_list:
            page_imgs = []
            for img_info in img_list:
                xref = img_info[0]
                if xref in seen_xrefs:
                    continue
                seen_xrefs.add(xref)

                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.n > 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)

                    mode    = "RGBA" if pix.alpha else "RGB"
                    pil_img = Image.frombytes(
                        mode, [pix.width, pix.height], pix.samples
                    )
                    if pil_img.mode == "RGBA":
                        pil_img = pil_img.convert("RGB")

                    # FILTER
                    if not _is_meaningful(pil_img):
                        continue

                    page_imgs.append(pil_img)
                except Exception:
                    continue

            if page_imgs:
                pil_images.extend(page_imgs)

        else:
            if page.get_text().strip():
                continue
            matrix  = fitz.Matrix(2, 2)
            pix     = page.get_pixmap(matrix=matrix)
            mode    = "RGBA" if pix.alpha else "RGB"
            pil_img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
            if pil_img.mode == "RGBA":
                pil_img = pil_img.convert("RGB")
            pil_images.append(pil_img)

    doc.close()
    return pil_images


# ── PDF builder ────────────────────────────────────────────────────────────

def _build_pdf(images, output_path, images_per_page):
    A4_W, A4_H = 595, 842

    page_w, page_h = (A4_H, A4_W) if images_per_page > 1 else (A4_W, A4_H)
    MARGIN = 10
    doc    = fitz.open()

    GRID = {1: (1, 1), 2: (2, 1), 4: (2, 2), 6: (3, 2), 9: (3, 3)}

    def _grid(n):
        for threshold, shape in sorted(GRID.items()):
            if n <= threshold:
                return shape
        return (3, 3)

    chunks = [
        images[i: i + images_per_page]
        for i in range(0, len(images), images_per_page)
    ]

    for chunk in chunks:
        page       = doc.new_page(width=page_w, height=page_h)
        cols, rows = _grid(images_per_page)
        cell_w     = (page_w - MARGIN * (cols + 1)) / cols
        cell_h     = (page_h - MARGIN * (rows + 1)) / rows

        for idx, img in enumerate(chunk):
            col = idx % cols
            row = idx // cols
            x0  = MARGIN + col * (cell_w + MARGIN)
            y0  = MARGIN + row * (cell_h + MARGIN)

            iw, ih = img.size
            scale  = min(cell_w / iw, cell_h / ih)
            new_w  = iw * scale
            new_h  = ih * scale
            cx     = x0 + (cell_w - new_w) / 2
            cy     = y0 + (cell_h - new_h) / 2
            rect   = fitz.Rect(cx, cy, cx + new_w, cy + new_h)

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            page.insert_image(rect, stream=buf.read())

    doc.save(output_path)
    doc.close()
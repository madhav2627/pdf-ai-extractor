"""
app.py — Student PDF Toolkit
────────────────────────────
Tools:
  1. Image Extractor
  2. Text Extractor
  3. PDF Merger
  4. PDF Splitter
  5. PDF Compressor
  6. Flashcard Generator
"""

import os
import time
import logging
import uuid

from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

import config
from utils.pdf_processor    import extract_and_build
from utils.text_extractor   import extract_text

from utils.pdf_merger       import merge_pdfs
from utils.pdf_splitter     import split_pdf
from utils.pdf_compressor   import compress_pdf
from utils.flashcard_generator import generate_flashcards

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── App setup ──────────────────────────────────────────────────────────────
app = Flask(__name__)
from converter_routes import converter_bp
app.register_blueprint(converter_bp)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_FILE_BYTES

os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
os.makedirs(config.OUTPUT_FOLDER, exist_ok=True)

# ── Rate limiter ───────────────────────────────────────────────────────────
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=[],
    storage_uri=config.RATE_LIMIT_STORAGE,
)

# ── Helpers ────────────────────────────────────────────────────────────────

def _is_pdf_extension(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in config.ALLOWED_EXTENSIONS


def _is_pdf_magic(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(4) == b"%PDF"
    except OSError:
        return False


def _cleanup_old_files():
    cutoff = time.time() - config.FILE_TTL_SECONDS
    removed = 0
    for folder in (config.UPLOAD_FOLDER, config.OUTPUT_FOLDER):
        for fname in os.listdir(folder):
            fpath = os.path.join(folder, fname)
            try:
                if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
                    removed += 1
            except OSError:
                pass
    if removed:
        log.info("Cleanup: removed %d stale file(s)", removed)


def _safe_delete(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


def _save_upload(file) -> tuple[str, str | None]:
    """Save an uploaded file. Returns (safe_name, input_path) or raises."""
    if not file or not file.filename:
        return None, None
    safe_name = secure_filename(file.filename)
    if not safe_name or not _is_pdf_extension(safe_name):
        return safe_name, None
    # Unique prefix to avoid collisions
    uid = uuid.uuid4().hex[:8]
    unique_name = f"{uid}_{safe_name}"
    input_path = os.path.join(config.UPLOAD_FOLDER, unique_name)
    file.save(input_path)
    return unique_name, input_path


# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── 1. Image Extractor ─────────────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
@limiter.limit(config.RATE_LIMIT)
def upload():
    _cleanup_old_files()

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file provided."}), 400

    safe_name, input_path = _save_upload(file)
    if not input_path:
        return jsonify({"error": "Only PDF files are accepted."}), 400

    if not _is_pdf_magic(input_path):
        _safe_delete(input_path)
        return jsonify({"error": "Uploaded file does not appear to be a valid PDF."}), 400

    try:
        images_per_page = int(request.form.get("images_per_page", 1))
        if images_per_page not in (1, 2, 4, 6, 9):
            raise ValueError
    except (ValueError, TypeError):
        _safe_delete(input_path)
        return jsonify({"error": "images_per_page must be 1, 2, 4, 6, or 9."}), 400

    enhance = request.form.get("enhance", "").strip().lower() in ("true", "1", "yes")
    if config.ENHANCE_DEFAULT:
        enhance = True

    output_filename = f"extracted_{safe_name}"
    output_path     = os.path.join(config.OUTPUT_FOLDER, output_filename)

    try:
        thumbnails = extract_and_build(
            input_path, output_path,
            images_per_page=images_per_page, enhance=enhance
        )
        log.info("Image extract: %d image(s) → '%s'", len(thumbnails), output_filename)
    except ValueError as exc:
        _safe_delete(input_path)
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        log.exception("Image extract error")
        _safe_delete(input_path)
        return jsonify({"error": f"Processing failed: {exc}"}), 500
    finally:
        _safe_delete(input_path)

    return jsonify({
        "download_url": f"/download/{output_filename}",
        "count":        len(thumbnails),
        "previews":     thumbnails,
        "enhanced":     enhance,
    })


# ── 2. Text Extractor ──────────────────────────────────────────────────────

@app.route("/extract-text", methods=["POST"])
@limiter.limit(config.RATE_LIMIT)
def extract_text_route():
    _cleanup_old_files()

    file = request.files.get("file")
    safe_name, input_path = _save_upload(file)
    if not input_path:
        return jsonify({"error": "Only PDF files are accepted."}), 400

    if not _is_pdf_magic(input_path):
        _safe_delete(input_path)
        return jsonify({"error": "Not a valid PDF."}), 400

    try:
        result = extract_text(input_path)

        # Save .txt output
        txt_filename = f"text_{safe_name}.txt"
        txt_path     = os.path.join(config.OUTPUT_FOLDER, txt_filename)
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(result["full_text"])

        log.info("Text extract: %d words", result["word_count"])
        return jsonify({
            "text":        result["full_text"],
            "word_count":  result["word_count"],
            "char_count":  result["char_count"],
            "page_count":  result["page_count"],
            "download_url": f"/download/{txt_filename}",
        })
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        log.exception("Text extract error")
        return jsonify({"error": f"Processing failed: {exc}"}), 500
    finally:
        _safe_delete(input_path)


# ── 3. PDF Merger ──────────────────────────────────────────────────────────

@app.route("/merge", methods=["POST"])
@limiter.limit(config.RATE_LIMIT)
def merge_route():
    _cleanup_old_files()

    files = request.files.getlist("files")
    if len(files) < 2:
        return jsonify({"error": "Please upload at least 2 PDF files."}), 400

    input_paths = []
    try:
        for file in files:
            safe_name, input_path = _save_upload(file)
            if not input_path:
                return jsonify({"error": f"'{file.filename}' is not a valid PDF."}), 400
            if not _is_pdf_magic(input_path):
                return jsonify({"error": f"'{file.filename}' does not appear to be a valid PDF."}), 400
            input_paths.append(input_path)

        uid = uuid.uuid4().hex[:8]
        output_filename = f"merged_{uid}.pdf"
        output_path     = os.path.join(config.OUTPUT_FOLDER, output_filename)

        result = merge_pdfs(input_paths, output_path)
        log.info("Merge: %d files → %d pages", result["file_count"], result["total_pages"])

        return jsonify({
            "download_url":  f"/download/{output_filename}",
            "file_count":    result["file_count"],
            "total_pages":   result["total_pages"],
        })
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        log.exception("Merge error")
        return jsonify({"error": f"Merge failed: {exc}"}), 500
    finally:
        for p in input_paths:
            _safe_delete(p)


# ── 5. PDF Splitter ────────────────────────────────────────────────────────

@app.route("/split", methods=["POST"])
@limiter.limit(config.RATE_LIMIT)
def split_route():
    _cleanup_old_files()

    file = request.files.get("file")
    safe_name, input_path = _save_upload(file)
    if not input_path:
        return jsonify({"error": "Only PDF files are accepted."}), 400

    if not _is_pdf_magic(input_path):
        _safe_delete(input_path)
        return jsonify({"error": "Not a valid PDF."}), 400

    try:
        start_page = int(request.form.get("start_page", 1))
        end_page   = int(request.form.get("end_page", 1))
    except (ValueError, TypeError):
        _safe_delete(input_path)
        return jsonify({"error": "start_page and end_page must be integers."}), 400

    try:
        output_filename = f"split_{safe_name}"
        output_path     = os.path.join(config.OUTPUT_FOLDER, output_filename)

        result = split_pdf(input_path, output_path, start_page, end_page)
        log.info("Split: pages %s of %d", result["range"], result["total_pages"])

        return jsonify({
            "download_url":     f"/download/{output_filename}",
            "extracted_pages":  result["extracted_pages"],
            "total_pages":      result["total_pages"],
            "range":            result["range"],
        })
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        log.exception("Split error")
        return jsonify({"error": f"Split failed: {exc}"}), 500
    finally:
        _safe_delete(input_path)


# ── 6. PDF Compressor ──────────────────────────────────────────────────────

@app.route("/compress", methods=["POST"])
@limiter.limit(config.RATE_LIMIT)
def compress_route():
    _cleanup_old_files()

    file = request.files.get("file")
    safe_name, input_path = _save_upload(file)
    if not input_path:
        return jsonify({"error": "Only PDF files are accepted."}), 400

    if not _is_pdf_magic(input_path):
        _safe_delete(input_path)
        return jsonify({"error": "Not a valid PDF."}), 400

    quality = request.form.get("quality", "medium").lower()
    if quality not in ("low", "medium", "high"):
        quality = "medium"

    try:
        output_filename = f"compressed_{safe_name}"
        output_path     = os.path.join(config.OUTPUT_FOLDER, output_filename)

        result = compress_pdf(input_path, output_path, quality=quality)
        log.info(
            "Compress: %.1f KB → %.1f KB (%.1f%% reduction)",
            result["original_kb"], result["compressed_kb"], result["reduction_pct"]
        )

        return jsonify({
            "download_url":     f"/download/{output_filename}",
            "original_kb":      result["original_kb"],
            "compressed_kb":    result["compressed_kb"],
            "reduction_pct":    result["reduction_pct"],
            "quality":          result["quality"],
        })
    except Exception as exc:
        log.exception("Compress error")
        return jsonify({"error": f"Compression failed: {exc}"}), 500
    finally:
        _safe_delete(input_path)


# ── 7. Flashcard Generator ─────────────────────────────────────────────────

@app.route("/flashcards", methods=["POST"])
@limiter.limit(config.RATE_LIMIT)
def flashcards_route():
    _cleanup_old_files()

    file = request.files.get("file")
    safe_name, input_path = _save_upload(file)
    if not input_path:
        return jsonify({"error": "Only PDF files are accepted."}), 400

    if not _is_pdf_magic(input_path):
        _safe_delete(input_path)
        return jsonify({"error": "Not a valid PDF."}), 400

    try:
        max_cards = int(request.form.get("max_cards", 20))
        max_cards = max(5, min(50, max_cards))
    except (ValueError, TypeError):
        max_cards = 20

    try:
        result = generate_flashcards(input_path, max_cards=max_cards)
        log.info("Flashcards: %d cards generated", result["count"])
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        log.exception("Flashcard error")
        return jsonify({"error": f"Flashcard generation failed: {exc}"}), 500
    finally:
        _safe_delete(input_path)


# ── Download ───────────────────────────────────────────────────────────────

@app.route("/download/<filename>")
def download(filename):
    safe_name = secure_filename(filename)
    file_path = os.path.join(config.OUTPUT_FOLDER, safe_name)
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found or already expired."}), 404
    return send_file(file_path, as_attachment=True)


# ── Error handlers ─────────────────────────────────────────────────────────

@app.errorhandler(413)
def request_entity_too_large(_):
    return jsonify({"error": f"File too large. Maximum is {config.MAX_FILE_MB} MB."}), 413


@app.errorhandler(429)
def too_many_requests(_):
    return jsonify({"error": "Too many requests. Please wait and try again."}), 429


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
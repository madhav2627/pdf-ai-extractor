"""
converter_routes.py
════════════════════
Blueprint that wires the Universal File Converter into your Flask app.

How to register in your main app.py:
────────────────────────────────────
    from converter_routes import converter_bp
    app.register_blueprint(converter_bp)

Then visit  /converter  in the browser.
"""

import os
import logging
from pathlib import Path

from flask import (
    Blueprint, render_template, request,
    send_file, jsonify, after_this_request,
)
from werkzeug.utils import secure_filename

from utils.converter import (
    convert,
    cleanup,
    allowed_file,
    valid_output_formats,
    MAX_BYTES,
    TEMP_DIR,
)

log = logging.getLogger(__name__)

converter_bp = Blueprint(
    "converter",
    __name__,
    template_folder="templates",
    static_folder="static",
)

# Temporary upload staging directory (separate from the output TEMP_DIR)
UPLOAD_STAGING = Path("uploads") / "converter_staging"
UPLOAD_STAGING.mkdir(parents=True, exist_ok=True)


# ── Page ──────────────────────────────────────────────────────────────────

@converter_bp.route("/converter")
def converter_page():
    return render_template("converter.html")


# ── Detect valid output formats ────────────────────────────────────────────

@converter_bp.route("/converter/formats", methods=["POST"])
def get_formats():
    """
    Accepts:  multipart filename OR JSON {"filename": "foo.pdf"}
    Returns:  {"formats": ["docx", "txt", "images"]}
    """
    filename = ""

    if request.is_json:
        filename = request.json.get("filename", "")
    else:
        f = request.files.get("file")
        filename = f.filename if f else request.form.get("filename", "")

    if not filename:
        return jsonify({"error": "No filename provided."}), 400

    formats = valid_output_formats(filename)
    if not formats:
        return jsonify({"error": "Unsupported file type."}), 400

    return jsonify({"formats": formats})


# ── Convert ────────────────────────────────────────────────────────────────

@converter_bp.route("/converter/convert", methods=["POST"])
def do_convert():
    """
    Accepts multipart/form-data:
        file          — the file to convert
        output_format — target format string (e.g. "docx", "txt", "pdf")

    Returns JSON on error, or the converted file as an attachment on success.
    """
    # ── Validate upload ───────────────────────────────────────────────────
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "No file provided."}), 400

    if not allowed_file(uploaded.filename):
        return jsonify({
            "error": (
                "Unsupported file type. "
                "Accepted: PDF, DOCX, TXT, JPG, PNG."
            )
        }), 400

    output_format = request.form.get("output_format", "").strip().lower()
    if not output_format:
        return jsonify({"error": "No output format specified."}), 400

    # ── Save to staging ───────────────────────────────────────────────────
    safe_name   = secure_filename(uploaded.filename)
    input_path  = UPLOAD_STAGING / safe_name
    uploaded.save(str(input_path))

    # Double-check size after save (MAX_CONTENT_LENGTH may not be set globally)
    if input_path.stat().st_size > MAX_BYTES:
        input_path.unlink(missing_ok=True)
        return jsonify({"error": "File exceeds the 50 MB size limit."}), 413

    # ── Run conversion ────────────────────────────────────────────────────
    try:
        result = convert(str(input_path), output_format)
    finally:
        # Always remove the staged upload regardless of outcome
        try:
            input_path.unlink(missing_ok=True)
        except OSError:
            pass

    if not result["ok"]:
        return jsonify({"error": result["error"]}), 422

    # ── Send file & schedule cleanup ──────────────────────────────────────
    output_path = result["path"]
    dl_name     = result["filename"]

    @after_this_request
    def _cleanup(response):
        cleanup(output_path)
        return response

    log.info("Conversion complete: %s → %s", safe_name, dl_name)
    return send_file(output_path, as_attachment=True, download_name=dl_name)


# ── Error handlers (scoped to blueprint) ──────────────────────────────────

@converter_bp.errorhandler(413)
def too_large(_):
    return jsonify({"error": "File too large. Maximum size is 50 MB."}), 413
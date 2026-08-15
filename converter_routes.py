"""
converter_routes.py
════════════════════
Blueprint providing Universal File Converter routes.
Handles:
  - PDF ↔ DOCX, TXT, Images (ZIP)
  - Word (.docx) → PDF
  - Text (.txt) → PDF
  - Images (JPG, PNG, WebP) → PDF (single or multi-image)
"""

import os
import logging
from pathlib import Path

import config

from flask import (
    Blueprint, redirect, render_template, request,
    send_file, jsonify, after_this_request, url_for
)
from werkzeug.utils import secure_filename

from utils.converter import (
    convert,
    convert_multiple_images_to_pdf,
    cleanup,
    allowed_file,
    valid_output_formats,
    MAX_BYTES,
    TEMP_DIR,
    TYPE_TO_FORMAT,
)

log = logging.getLogger(__name__)

converter_bp = Blueprint(
    "converter",
    __name__,
    template_folder="templates",
    static_folder="static",
)

# Temporary upload staging directory
UPLOAD_STAGING = Path(config.UPLOAD_FOLDER) / "converter_staging"
UPLOAD_STAGING.mkdir(parents=True, exist_ok=True)


# ── Page Route ────────────────────────────────────────────────────────────

@converter_bp.route("/converter")
def converter_page():
    """Redirect to the main student workspace with the converter tool active."""
    return redirect("/?tool=converter")


# ── Detect valid output formats ───────────────────────────────────────────

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


# ── Convert Endpoint (Handles both /converter/convert and /convert) ────────

@converter_bp.route("/converter/convert", methods=["POST"])
@converter_bp.route("/convert", methods=["POST"])
def do_convert():
    """
    Accepts multipart/form-data:
        file / files      — uploaded file(s)
        conversion_type   — e.g. "pdf-to-docx", "images-to-pdf", "docx-to-pdf"
        OR output_format  — e.g. "docx", "txt", "pdf", "images"
    """
    conversion_type = request.form.get("conversion_type", "").strip().lower()
    output_format = request.form.get("output_format", "").strip().lower()

    # Resolve output format and mode if conversion_type was passed
    if conversion_type:
        if conversion_type in TYPE_TO_FORMAT:
            _, target = TYPE_TO_FORMAT[conversion_type]
            output_format = target
        elif "-" in conversion_type:
            output_format = conversion_type.split("-")[-1]

    # Handle multi-file image conversion to PDF
    if conversion_type == "images-to-pdf" or (output_format == "pdf" and "files" in request.files):
        uploaded_files = request.files.getlist("files") or request.files.getlist("files[]") or request.files.getlist("file")
        if not uploaded_files or not any(f.filename for f in uploaded_files):
            return jsonify({"error": "Please select at least one image file."}), 400

        staged_paths = []
        try:
            total_size = 0
            for f in uploaded_files:
                if not f or not f.filename:
                    continue
                safe_name = secure_filename(f.filename)
                if not safe_name:
                    continue
                input_path = UPLOAD_STAGING / f"img_{len(staged_paths)}_{safe_name}"
                f.save(str(input_path))
                total_size += input_path.stat().st_size
                staged_paths.append(str(input_path))

            if total_size > MAX_BYTES:
                return jsonify({"error": "Combined image files exceed the 100 MB limit."}), 413

            if not staged_paths:
                return jsonify({"error": "No valid image files were received."}), 400

            result = convert_multiple_images_to_pdf(staged_paths, output_stem="combined_images")
        finally:
            for p in staged_paths:
                try:
                    Path(p).unlink(missing_ok=True)
                except OSError:
                    pass

        if not result.get("ok"):
            return jsonify({"error": result.get("error", "Images to PDF conversion failed.")}), 422

        output_path = result["path"]
        dl_name = result.get("filename", "converted.pdf")

        @after_this_request
        def _cleanup_multi(response):
            cleanup(output_path)
            return response

        return send_file(output_path, as_attachment=True, download_name=dl_name)

    # ── Single-file conversion ─────────────────────────────────────────────
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        # Check if sent under 'files'
        files_list = request.files.getlist("files")
        if files_list and files_list[0].filename:
            uploaded = files_list[0]

    if not uploaded or not uploaded.filename:
        return jsonify({"error": "No file provided."}), 400

    if not allowed_file(uploaded.filename):
        return jsonify({
            "error": (
                "Unsupported file type. "
                "Accepted formats: PDF, DOCX, TXT, JPG, PNG, WEBP."
            )
        }), 400

    if not output_format:
        return jsonify({"error": "No output format specified."}), 400

    safe_name = secure_filename(uploaded.filename)
    input_path = UPLOAD_STAGING / safe_name
    uploaded.save(str(input_path))

    if input_path.stat().st_size > MAX_BYTES:
        input_path.unlink(missing_ok=True)
        return jsonify({"error": "File exceeds the 100 MB limit."}), 413

    try:
        result = convert(str(input_path), output_format)
    finally:
        try:
            input_path.unlink(missing_ok=True)
        except OSError:
            pass

    if not result.get("ok"):
        return jsonify({"error": result.get("error", "Conversion failed.")}), 422

    output_path = result["path"]
    dl_name = result.get("filename", f"converted.{output_format}")

    @after_this_request
    def _cleanup_single(response):
        cleanup(output_path)
        return response

    log.info("Conversion successful: %s → %s", safe_name, dl_name)
    return send_file(output_path, as_attachment=True, download_name=dl_name)


# ── Error handlers ────────────────────────────────────────────────────────

@converter_bp.errorhandler(413)
def too_large(_):
    return jsonify({"error": "File too large. Maximum size is 100 MB."}), 413
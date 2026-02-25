"""
config.py — Central settings for Student PDF Toolkit.
"""
import os

# ── Folders ────────────────────────────────────────────────────────────────
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"

# ── File security ──────────────────────────────────────────────────────────
MAX_FILE_MB    = 200
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf"}

# ── Automatic cleanup ──────────────────────────────────────────────────────
FILE_TTL_SECONDS = 30 * 60

# ── Rate limiting ──────────────────────────────────────────────────────────
RATE_LIMIT         = "20 per minute"
RATE_LIMIT_STORAGE = "memory://"

# ── Preview thumbnails ─────────────────────────────────────────────────────
THUMBNAIL_SIZE    = (320, 320)
THUMBNAIL_QUALITY = 82

# ── Image enhancement ─────────────────────────────────────────────────────
ENHANCE_DEFAULT = False
ENHANCE_UPSCALE = False

# ── PDF extraction thresholds ──────────────────────────────────────────────
MIN_WIDTH  = 150
MIN_HEIGHT = 150
MIN_AREA   = 30_000
MAX_ASPECT = 8.0

# ── Compression ───────────────────────────────────────────────────────────
COMPRESS_DPI      = 96      # lower = smaller file
COMPRESS_QUALITY  = 60      # JPEG quality for images inside PDF
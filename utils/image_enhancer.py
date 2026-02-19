import cv2
import numpy as np
from PIL import Image


def enhance_image(pil_image, upscale=False):
    """
    Enhance image quality for better clarity in PDFs.
    Works for scanned docs, notes, and diagrams.
    """

    img = np.array(pil_image)

    # Remove alpha channel if present
    if img.ndim == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    # Convert to grayscale for document clarity
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=15)

    # Increase contrast using CLAHE (adaptive histogram equalization)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    contrast = clahe.apply(denoised)

    # Sharpen
    kernel = np.array([[0, -1,  0],
                       [-1,  5, -1],
                       [0, -1,  0]])
    sharpened = cv2.filter2D(contrast, -1, kernel)

    # Optional 2x upscale
    if upscale:
        sharpened = cv2.resize(
            sharpened,
            None,
            fx=2,
            fy=2,
            interpolation=cv2.INTER_CUBIC,
        )

    return Image.fromarray(sharpened)
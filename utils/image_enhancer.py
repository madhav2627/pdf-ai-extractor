import cv2
import numpy as np
from PIL import Image


def enhance_image(pil_image, upscale=False):
    """Enhance image quality for better clarity in PDFs."""
    img = np.array(pil_image)
    if img.ndim == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=15)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    contrast = clahe.apply(denoised)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(contrast, -1, kernel)
    if upscale:
        sharpened = cv2.resize(sharpened, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    return Image.fromarray(sharpened)
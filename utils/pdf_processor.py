import fitz
import io
import math


def is_valid_image(img):
    """Filter unwanted images."""
    width, height = img.size

    if width < 100 or height < 100:
        return False

    if width > 10 * height or height > 10 * width:
        return False

    extrema = img.convert("L").getextrema()
    if extrema[0] == extrema[1]:
        return False

    return True


def create_grid_page(images, images_per_page):
    """Create a grid layout page."""
    cols = math.ceil(math.sqrt(images_per_page))
    rows = math.ceil(images_per_page / cols)

    page_width, page_height = 2480, 3508  # A4 at 300 DPI
    grid_img = Image.new("RGB", (page_width, page_height), "white")

    cell_w = page_width // cols
    cell_h = page_height // rows

    for idx, img in enumerate(images):
        img.thumbnail((cell_w - 20, cell_h - 20))

        x = (idx % cols) * cell_w + 10
        y = (idx // cols) * cell_h + 10

        grid_img.paste(img, (x, y))

    return grid_img


def extract_images_to_pdf(input_pdf, output_pdf, images_per_page=1):
    doc = fitz.open(input_pdf)
    images = []

    for page in doc:
        for img in page.get_images(full=True):
            xref = img[0]
            base = doc.extract_image(xref)
            image_bytes = base["image"]

            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

            if is_valid_image(image):
                images.append(image)

    if not images:
        raise ValueError("No useful images found.")

    pages = []
    for i in range(0, len(images), images_per_page):
        chunk = images[i:i + images_per_page]
        pages.append(create_grid_page(chunk, images_per_page))

    pages[0].save(output_pdf, save_all=True, append_images=pages[1:])

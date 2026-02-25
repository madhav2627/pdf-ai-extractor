"""
pdf_splitter.py — Split PDF by page range
"""
import fitz


def split_pdf(input_path: str, output_path: str, start_page: int, end_page: int) -> dict:
    """
    Extract pages [start_page, end_page] (1-indexed, inclusive) from input_path.
    Returns info dict.
    """
    doc = fitz.open(input_path)
    total = len(doc)

    if start_page < 1 or end_page > total or start_page > end_page:
        doc.close()
        raise ValueError(
            f"Invalid page range {start_page}–{end_page}. PDF has {total} pages."
        )

    out = fitz.open()
    # insert_pdf uses 0-indexed from/to
    out.insert_pdf(doc, from_page=start_page - 1, to_page=end_page - 1)
    out.save(output_path)
    out.close()
    doc.close()

    extracted = end_page - start_page + 1
    return {
        "total_pages": total,
        "extracted_pages": extracted,
        "range": f"{start_page}–{end_page}",
    }
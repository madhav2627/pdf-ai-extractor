"""
pdf_merger.py — Merge multiple PDFs into one
"""
import fitz


def merge_pdfs(input_paths: list, output_path: str) -> dict:
    """
    Merge a list of PDF file paths into a single PDF at output_path.
    Returns info dict.
    """
    if len(input_paths) < 2:
        raise ValueError("Please provide at least 2 PDF files to merge.")

    merged = fitz.open()
    total_pages = 0

    for path in input_paths:
        doc = fitz.open(path)
        merged.insert_pdf(doc)
        total_pages += len(doc)
        doc.close()

    merged.save(output_path)
    merged.close()

    return {
        "file_count": len(input_paths),
        "total_pages": total_pages,
    }
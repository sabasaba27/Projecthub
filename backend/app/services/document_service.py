from pathlib import Path
from typing import Iterable
from docx import Document as DocxDocument
from pypdf import PdfReader


def extract_pdf_paragraphs(file_path: Path) -> Iterable[tuple[int, int, str]]:
    reader = PdfReader(str(file_path))
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
        for paragraph_index, paragraph in enumerate(paragraphs, start=1):
            yield page_index, paragraph_index, paragraph


def extract_docx_paragraphs(file_path: Path) -> Iterable[tuple[int, int, str]]:
    doc = DocxDocument(str(file_path))
    for paragraph_index, paragraph in enumerate(doc.paragraphs, start=1):
        content = paragraph.text.strip()
        if content:
            yield None, paragraph_index, content


def extract_paragraphs(file_path: Path, file_type: str) -> Iterable[tuple[int | None, int, str]]:
    if file_type.lower() == "pdf":
        yield from extract_pdf_paragraphs(file_path)
        return
    if file_type.lower() == "docx":
        yield from extract_docx_paragraphs(file_path)
        return
    raise ValueError(f"Unsupported file type: {file_type}")

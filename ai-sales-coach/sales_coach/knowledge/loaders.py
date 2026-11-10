"""Extraction de texte : PDF, DOCX, XLSX, TXT, CSV, MD."""
from __future__ import annotations

import csv
import io
from pathlib import Path

SUPPORTED = {".pdf", ".docx", ".xlsx", ".txt", ".csv", ".md"}


def extract_text(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        pages = []
        for i, page in enumerate(reader.pages, 1):
            txt = (page.extract_text() or "").strip()
            if txt:
                pages.append(f"[page {i}]\n{txt}")
        if not pages:
            raise ValueError("PDF sans texte extractible (PDF scanné ?) : un OCR préalable est nécessaire.")
        return "\n\n".join(pages)
    if ext == ".docx":
        from docx import Document

        doc = Document(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                parts.append(" | ".join(c.text.strip() for c in row.cells))
        return "\n".join(parts)
    if ext == ".xlsx":
        from openpyxl import load_workbook

        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        parts = []
        for ws in wb.worksheets:
            parts.append(f"[feuille {ws.title}]")
            header = None
            for row in ws.iter_rows(values_only=True):
                cells = ["" if v is None else str(v) for v in row]
                if not any(cells):
                    continue
                if header is None:
                    header = cells
                    parts.append(" | ".join(cells))
                else:
                    parts.append(" ; ".join(f"{h}: {v}" for h, v in zip(header, cells) if v))
        return "\n".join(parts)
    if ext == ".csv":
        text = _decode(data)
        dialect = csv.Sniffer().sniff(text[:2000], delimiters=",;\t") if text.strip() else csv.excel
        rows = list(csv.reader(io.StringIO(text), dialect))
        if not rows:
            return ""
        header = rows[0]
        return "\n".join([" | ".join(header)] + [" ; ".join(f"{h}: {v}" for h, v in zip(header, r) if v) for r in rows[1:]])
    if ext in {".txt", ".md"}:
        return _decode(data)
    raise ValueError(f"Format non pris en charge : {ext} (acceptés : {', '.join(sorted(SUPPORTED))})")


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def chunk_text(text: str, max_words: int = 220, overlap: int = 40) -> list[str]:
    """Découpe par paragraphes, regroupés jusqu'à ~max_words, avec chevauchement."""
    paras = [p.strip() for p in text.replace("\r\n", "\n").split("\n\n") if p.strip()]
    chunks, current = [], []
    for p in paras:
        w = p.split()
        if len(w) > max_words:
            if current:
                chunks.append(" ".join(current))
                current = []
            step = max_words - overlap
            for i in range(0, len(w), step):
                chunks.append(" ".join(w[i:i + max_words]))
            continue
        if len(current) + len(w) > max_words and current:
            chunks.append(" ".join(current))
            current = current[-overlap:] if overlap else []
        current.extend(w)
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if len(c.split()) >= 5]

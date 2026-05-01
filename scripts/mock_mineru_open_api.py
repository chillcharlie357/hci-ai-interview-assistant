#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from html import unescape
from pathlib import Path
from zipfile import ZipFile


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "flash-extract":
        print("usage: mock_mineru_open_api.py flash-extract <file>", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[2])
    if not input_path.exists():
        print("input file not found", file=sys.stderr)
        return 1

    if input_path.suffix.lower() == ".docx":
        print(extract_docx(input_path))
        return 0

    print(f"# Mock Resume\n\nExtracted placeholder text from {input_path.name}.")
    return 0


def extract_docx(path: Path) -> str:
    with ZipFile(path) as docx:
        document_xml = docx.read("word/document.xml").decode("utf-8")

    paragraphs = re.findall(r"<w:p\b[^>]*>(.*?)</w:p>", document_xml, flags=re.DOTALL)
    lines: list[str] = []
    for paragraph in paragraphs:
        text_chunks = re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", paragraph, flags=re.DOTALL)
        text = unescape("".join(text_chunks)).strip()
        if text:
            lines.append(text)

    if not lines:
        return "# Mock Resume\n\n未提取到正文。"
    return "# " + lines[0] + "\n\n" + "\n\n".join(lines[1:])


if __name__ == "__main__":
    raise SystemExit(main())

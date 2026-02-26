#!/usr/bin/env python3
import os
import re
from pathlib import Path

SKYTH_DIR = Path("skyth")


def convert_import(full_match: str, file_path: Path) -> str:
    match = re.search(r'from\s+["\'](\.+)(/.+?)["\']', full_match)
    if not match:
        return full_match

    dots = match.group(1)
    remainder = match.group(2)

    depth = len(dots)
    file_parts = file_path.relative_to(SKYTH_DIR).parts[:-1]

    if dots == ".":
        abs_parts = file_parts
    elif dots.startswith(".."):
        parent_depth = depth - 1
        abs_parts = (
            file_parts[:-parent_depth] if parent_depth <= len(file_parts) else []
        )
    else:
        abs_parts = file_parts

    rel_path = remainder.lstrip("/")
    abs_path = "/".join(list(abs_parts) + [rel_path]) if abs_parts else rel_path

    before = full_match[: match.start()]
    after = full_match[match.end() :]
    return f'{before}from "@/{abs_path}"{after}'


def process_file(file_path: Path) -> tuple[int, str]:
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        return 0, str(e)

    original_content = content

    def replace_func(m):
        return convert_import(m.group(0), file_path)

    content = re.sub(r'from\s+["\'](\.+)(/.+?)["\']', replace_func, content)

    modified = original_content.count('from "./') + original_content.count('from "../')
    modified -= content.count('from "./') + content.count('from "../')

    if modified > 0:
        file_path.write_text(content, encoding="utf-8")

    return modified, ""


def main():
    total_modified = 0
    files_changed = 0
    errors = []

    for ts_file in SKYTH_DIR.rglob("*.ts"):
        modified, error = process_file(ts_file)
        if error:
            errors.append((ts_file, error))
        elif modified > 0:
            files_changed += 1
            total_modified += modified
            print(f"  {ts_file}: {modified} imports")

    print(f"\nTotal: {total_modified} imports in {files_changed} files")
    if errors:
        print(f"\nErrors:")
        for path, err in errors:
            print(f"  {path}: {err}")


if __name__ == "__main__":
    main()

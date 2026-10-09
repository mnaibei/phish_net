"""
Repairs data/sms_dataset.csv when every row was saved as one quoted cell.

Run from the repo root:
    python training/fix_csv.py
"""
import csv
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT / "data" / "sms_dataset.csv"
BACKUP = ROOT / "data" / "sms_dataset.csv.bak"

shutil.copy(CSV_FILE, BACKUP)

rows = []
skipped = 0

with open(CSV_FILE, encoding="utf-8-sig") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue

        # remove the outer pair of quotes wrapped around the whole line
        if line.startswith('"') and line.endswith('"'):
            line = line[1:-1]
        line = line.replace('""', '"')

        # the last two fields have no commas, so split from the right
        parts = line.rsplit(",", 2)
        if len(parts) != 3:
            skipped += 1
            print("Skipped (could not split):", line[:60])
            continue

        text, label, language = [p.strip() for p in parts]
        text = text.strip('"').strip()

        if text.lower() == "text":  # the header row
            continue
        rows.append([text, label.lower(), language.lower()])

with open(CSV_FILE, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["text", "label", "language"])
    writer.writerows(rows)

print(f"Fixed {len(rows)} rows ({skipped} skipped). Backup saved as {BACKUP.name}")
"""
Repairs data/sms_dataset.csv and puts every message on ONE line.

It handles:
  - rows that were saved as one big quoted cell ("text,label,language")
  - messages that contain line breaks, blank lines or extra spaces
  - rows that are already correct (3 proper columns)

Run from the repo root:
    python training/fix_csv.py
"""
import csv
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_FILE = ROOT / "data" / "sms_dataset.csv"
BACKUP = ROOT / "data" / "sms_dataset.csv.bak"

VALID_LABELS = ["scam", "legit"]
MAX_TEXT_LENGTH = 1000  # real SMS are far shorter; longer usually means two messages got merged

# Keep the ORIGINAL file safe: the backup is only made the first time,
# so running this script again never overwrites it.
if not BACKUP.exists():
    shutil.copy(CSV_FILE, BACKUP)

rows = []
skipped = 0

# newline="" is needed so the csv module can handle line breaks INSIDE a message.
# The csv module reads a quoted message as ONE record, even if it spans many lines.
with open(CSV_FILE, encoding="utf-8-sig", newline="") as f:
    for record in csv.reader(f):

        # Ignore completely empty rows.
        if not any(field.strip() for field in record):
            continue

        if len(record) == 1:
            # Broken format: the whole row is one cell: "message,label,language".
            # The last two fields never contain commas, so split from the RIGHT.
            parts = record[0].rsplit(",", 2)
            if len(parts) != 3:
                skipped += 1
                print("Skipped (could not split):", record[0][:60].replace("\n", " "))
                continue
            text, label, language = parts
        elif len(record) >= 3:
            # Correct format: text, label, language (join any extra commas back into the text).
            text = ",".join(record[:-2])
            label, language = record[-2], record[-1]
        else:
            skipped += 1
            print("Skipped (unexpected columns):", record[0][:60].replace("\n", " "))
            continue

        # Flatten the message: any run of spaces, tabs or line breaks becomes ONE space.
        text = " ".join(text.split())
        label = label.strip().lower()
        language = language.strip().lower()

        # Skip the header row.
        if text.lower() == "text" and label == "label":
            continue

        if not text:
            skipped += 1
            continue

        if label not in VALID_LABELS:
            skipped += 1
            print(f"Skipped (label must be 'scam' or 'legit', got '{label}'):", text[:60])
            continue

        if len(text) > MAX_TEXT_LENGTH:
            print(f"WARNING: very long message ({len(text)} characters), check it is not two merged:", text[:60])

        rows.append([text, label, language])

with open(CSV_FILE, "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["text", "label", "language"])
    writer.writerows(rows)

scam_count = sum(1 for r in rows if r[1] == "scam")
legit_count = sum(1 for r in rows if r[1] == "legit")
print(f"Fixed {len(rows)} rows ({scam_count} scam, {legit_count} legit, {skipped} skipped).")
print(f"Original kept in {BACKUP.name}")
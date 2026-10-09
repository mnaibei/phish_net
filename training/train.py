"""
Trains the SMS phishing model and exports it to extension/model.json

Run from the repo root:
    python training/train.py
"""
import json
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "sms_dataset.csv"
OUT_FILE = ROOT / "extension" / "model.json"

NGRAM_RANGE = (2, 5)
MIN_PER_CLASS = 10

# ---------- 1. Load and clean the data ----------
df = pd.read_csv(DATA_FILE)
df = df.dropna(subset=["text", "label"])
df["text"] = df["text"].astype(str).str.strip()
df["label"] = df["label"].astype(str).str.strip().str.lower()
df = df[df["label"].isin(["scam", "legit"])]
df = df.drop_duplicates(subset="text")

print("Messages loaded:")
print(df["label"].value_counts().to_string())
print()

counts = df["label"].value_counts()
for label in ["scam", "legit"]:
    if counts.get(label, 0) < MIN_PER_CLASS:
        raise SystemExit(f"Need at least {MIN_PER_CLASS} '{label}' messages. Add more data first.")

texts = df["text"]
y = (df["label"] == "scam").astype(int)  # 1 = scam, 0 = legit


def make_vectorizer():
    # Character n-grams cope well with Swahili, Sheng, misspellings and mixed languages.
    return TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=NGRAM_RANGE,
        lowercase=True,
        sublinear_tf=True,
        min_df=2,
        max_features=20000,
    )


def make_model():
    return LogisticRegression(class_weight="balanced", max_iter=1000)


# ---------- 2. Test how good it is on messages it has NOT seen ----------
X_train, X_test, y_train, y_test = train_test_split(
    texts, y, test_size=0.2, stratify=y, random_state=42
)

vec = make_vectorizer()
clf = make_model()
clf.fit(vec.fit_transform(X_train), y_train)
pred = clf.predict(vec.transform(X_test))

print("=== Results on the test set ===")
print(classification_report(y_test, pred, target_names=["legit", "scam"], zero_division=0))
print("Confusion matrix (rows = real, columns = predicted) [legit, scam]:")
print(confusion_matrix(y_test, pred))
print()

# ---------- 3. Retrain on ALL the data and export ----------
vec = make_vectorizer()
clf = make_model()
clf.fit(vec.fit_transform(texts), y)

weights = {}
for term, i in vec.vocabulary_.items():
    weights[term] = [round(float(vec.idf_[i]), 5), round(float(clf.coef_[0][i]), 5)]

model = {
    "ngram_range": list(NGRAM_RANGE),
    "sublinear_tf": True,
    "intercept": round(float(clf.intercept_[0]), 5),
    "weights": weights,  # term -> [idf, coefficient]
}

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(model, f, ensure_ascii=False)

print(f"Saved {len(weights)} features to {OUT_FILE}")
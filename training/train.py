"""
WHAT THIS FILE DOES
-------------------------------------
This program teaches the computer to tell scam SMS messages from normal ones.

  1. It reads our collection of labelled messages (data/sms_dataset.csv).
  2. It studies the messages to learn which patterns show up in scams.
  3. It tests itself on messages it has never seen, and prints a score card.
  4. It saves what it learned into extension/model.json, which the browser
     extension reads when someone pastes an SMS.

How to run it (from the main project folder):
    python training/train.py
"""

# ---------- TOOLS WE BORROW ----------
# "import" means: bring in ready-made tools written by other people,
# so we don't have to build everything from scratch.
import json                  # lets us save our results as a .json file
from pathlib import Path     # helps us work with file and folder locations

import pandas as pd          # pandas = a tool for working with tables (like Excel, but in code)

# scikit-learn is the machine learning toolbox. We take 5 tools from it:
from sklearn.feature_extraction.text import TfidfVectorizer   # turns text into numbers
from sklearn.linear_model import LogisticRegression           # the "learner" that makes the decisions
from sklearn.metrics import classification_report, confusion_matrix  # tools that make the score card
from sklearn.model_selection import train_test_split          # splits data into "study" and "exam" piles

# ---------- FILE LOCATIONS ----------
# __file__ is this file (train.py), which lives in the "training" folder.
# .parent goes up one folder; doing it twice takes us to the main project folder.
ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "sms_dataset.csv"        # where we READ the messages from
OUT_FILE = ROOT / "extension" / "model.json"         # where we SAVE what the computer learned

# ---------- SETTINGS (easy to change) ----------
# The computer studies text in small pieces of 2 to 5 characters at a time.
# Example: the word "pin" contains the pieces " p", "pi", "in", "n ", " pi", "pin", "in ", ...
NGRAM_RANGE = (2, 5)

# Safety check: we refuse to train unless we have at least this many
# scam messages AND this many legit messages. Too few = a useless model.
MIN_PER_CLASS = 10

# ---------- 1. Load and clean the data ----------

# Open the CSV file and load it into a table called "df" (short for DataFrame).
df = pd.read_csv(DATA_FILE)

# Throw away any row where the message text OR the label is empty.
df = df.dropna(subset=["text", "label"])

# Tidy the text: make sure it is text, and remove extra spaces at the start/end.
df["text"] = df["text"].astype(str).str.strip()

# Tidy the labels: remove spaces and make lowercase, so "Scam " becomes "scam".
df["label"] = df["label"].astype(str).str.strip().str.lower()

# Keep only rows whose label is exactly "scam" or "legit". Anything else (typos) is dropped.
df = df[df["label"].isin(["scam", "legit"])]

# If the same message appears twice, keep just one copy.
# (Otherwise the computer could "memorise" repeated messages and look smarter than it is.)
df = df.drop_duplicates(subset="text")

# Show the team how many messages of each type we ended up with.
print("Messages loaded:")
print(df["label"].value_counts().to_string())
print()

# Count again, then check we have enough of BOTH types.
counts = df["label"].value_counts()
for label in ["scam", "legit"]:
    if counts.get(label, 0) < MIN_PER_CLASS:
        # SystemExit stops the program and shows this message to the user.
        raise SystemExit(f"Need at least {MIN_PER_CLASS} '{label}' messages. Add more data first.")

# "texts" = the messages (what the computer reads).
texts = df["text"]

# "y" = the correct answers (what the computer must learn to predict).
# Computers like numbers, so we turn the labels into numbers: scam = 1, legit = 0.
y = (df["label"] == "scam").astype(int)  # 1 = scam, 0 = legit


# ---------- RECIPES FOR OUR TOOLS ----------
# A "def" is a reusable recipe. We write these two recipes once and use them twice below
# (once for the practice test, once for the final version).

def make_vectorizer():
    # A "vectorizer" turns each SMS into a list of numbers, because computers can't learn from raw words.
    # Character n-grams cope well with Swahili, Sheng, misspellings and mixed languages.
    return TfidfVectorizer(
        analyzer="char_wb",         # cut each WORD into small character pieces (not whole words)
        ngram_range=NGRAM_RANGE,    # piece sizes: 2 to 5 characters (set at the top)
        lowercase=True,             # treat "URGENT" and "urgent" as the same
        sublinear_tf=True,          # if a piece repeats 10 times, don't count it 10x as important
        min_df=2,                   # ignore pieces that appear in only 1 message (probably noise)
        max_features=20000,         # keep at most the 20,000 most common pieces (keeps the file small)
    )


def make_model():
    # The "learner". Logistic Regression gives every text piece a score:
    # pieces common in scams push toward "scam", pieces common in normal SMS push toward "legit".
    return LogisticRegression(
        class_weight="balanced",    # if we have far more legit than scam messages (or the reverse),
                                    # treat mistakes on the rarer type as more serious
        max_iter=1000,              # how many practice rounds it is allowed while learning
    )


# ---------- 2. Test how good it is on messages it has NOT seen ----------
# Like a student: you can't judge how well they learned by re-asking the questions
# they already studied. So we hide 20% of the messages as an "exam".

X_train, X_test, y_train, y_test = train_test_split(
    texts, y,
    test_size=0.2,    # 20% of messages are kept aside for the exam
    stratify=y,       # keep the same scam/legit mix in the study pile and the exam pile
    random_state=42,  # makes the shuffle repeatable, so everyone gets the same split
)
# X_train / y_train = the study messages and their correct answers
# X_test  / y_test  = the exam messages and their correct answers (hidden from the computer)

vec = make_vectorizer()   # make a fresh text-to-numbers tool
clf = make_model()        # make a fresh learner ("clf" is short for classifier)

# STUDY TIME:
#  - vec.fit_transform(X_train): learn which text pieces exist in the study messages,
#    and turn those messages into numbers.
#  - clf.fit(...): the learner studies those numbers together with the correct answers.
clf.fit(vec.fit_transform(X_train), y_train)

# EXAM TIME: give the learner the hidden exam messages and let it guess scam/legit.
# We use vec.transform (NOT fit_transform) so the exam can't teach the computer anything new.
pred = clf.predict(vec.transform(X_test))

# Print the score card.
print("=== Results on the test set ===")
# Precision: when it says "scam", how often is it right?
# Recall: out of all the real scams, how many did it catch?
print(classification_report(y_test, pred, target_names=["legit", "scam"], zero_division=0))

# The confusion matrix shows exactly where the computer got confused:
#   [[legit judged legit (good),   legit judged scam (BAD - false alarm)],
#    [scam judged legit (BAD - missed scam),   scam judged scam (good)]]
print("Confusion matrix (rows = real, columns = predicted) [legit, scam]:")
print(confusion_matrix(y_test, pred))
print()

# ---------- 3. Retrain on ALL the data and export ----------
# The exam is over and we know how well the method works. Now we build the FINAL
# version using every message (more examples = a smarter model).
vec = make_vectorizer()
clf = make_model()
clf.fit(vec.fit_transform(texts), y)

# Build a "dictionary" of everything the computer learned.
# For each text piece (e.g. "pin "), we store two numbers:
#   [0] idf  = how special/rare the piece is (rare pieces are more informative)
#   [1] coef = its vote: positive = points toward SCAM, negative = points toward LEGIT
weights = {}
for term, i in vec.vocabulary_.items():
    # vec.vocabulary_ maps each text piece to a position number (i).
    # vec.idf_[i] and clf.coef_[0][i] are the two numbers stored at that position.
    # round(..., 5) keeps 5 decimal places so the saved file stays small.
    weights[term] = [round(float(vec.idf_[i]), 5), round(float(clf.coef_[0][i]), 5)]

# Bundle everything the browser extension needs to repeat our maths on its own.
model = {
    "ngram_range": list(NGRAM_RANGE),                # the piece sizes (2 to 5)
    "sublinear_tf": True,                            # same repeat-counting rule as in training
    "intercept": round(float(clf.intercept_[0]), 5), # the "starting score" before any pieces are counted
    "weights": weights,  # term -> [idf, coefficient]
}

# Save it all into model.json. (ensure_ascii=False keeps Swahili/special characters readable.)
with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(model, f, ensure_ascii=False)

# Final message so we know it worked.
print(f"Saved {len(weights)} features to {OUT_FILE}")
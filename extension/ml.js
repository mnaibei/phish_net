/*
  WHAT THIS FILE DOES
  -------------------------------------
  Python (train.py) taught the computer and saved its "notes" in model.json.
  This file is the part that READS those notes inside the browser extension
  and uses them to judge a new SMS.

  It does 4 things:
    1. Loads model.json (the notes).
    2. Chops the SMS into small letter pieces, exactly the way Python did.
    3. Adds up the "votes" of all the pieces it recognises.
    4. Turns the total into a scam score from 0 to 100.

  IMPORTANT: the maths here must match train.py exactly. If someone changes
  how train.py cuts up text, this file must be changed to match, or the
  scores will be wrong.
*/

// ml.js - runs the trained model (model.json) inside the extension.
// The n-gram logic copies scikit-learn's "char_wb" analyzer so results match training.

// A storage box for the model. It starts empty (null) and gets filled the first time we need it.
let MODEL = null;

// ---------- STEP 1: LOAD THE NOTES FROM model.json ----------
// "async" means this function may take a moment (it has to fetch a file),
// so the rest of the program waits for it using "await".
async function loadModel() {
  // If we already loaded the model earlier, reuse it instead of loading it again.
  if (MODEL) return MODEL;

  // "try" = attempt this. If anything goes wrong, jump to "catch" instead of crashing.
  try {
    // Ask for the file model.json (it sits in the same folder as the popup).
    const res = await fetch("model.json");

    // If the file was not found or could not be read, treat it as an error.
    if (!res.ok) throw new Error("HTTP " + res.status);

    // Read the file's contents and turn the text into a usable JavaScript object.
    MODEL = await res.json();
  } catch (err) {
    // Something went wrong (for example, train.py has not been run yet, so no model.json exists).
    // We log a warning for developers (visible in the browser's console) but do NOT crash.
    console.warn("Could not load model.json:", err);
    MODEL = null;
  }
  return MODEL;
}

// ---------- STEP 2: CHOP THE SMS INTO SMALL PIECES ----------
// Splits text into words, pads each word with spaces, then takes every
// piece of length minN..maxN (e.g. " pin " -> " p", "pi", "in", "n ", " pi", ...).
function charWbNgrams(text, minN, maxN) {
  // The list where we collect all the pieces ("grams" = small chunks).
  const grams = [];

  // Make everything lowercase ("URGENT" = "urgent"), cut the message into words
  // wherever there are spaces/line breaks, and remove any empty leftovers.
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  // Handle one word at a time.
  for (const word of words) {
    // Put a space at each end of the word. This lets the model notice
    // the START and END of words (" pin" is different from "spin").
    const w = " " + word + " ";

    // Cut pieces of every size from minN up to maxN (for us: 2, 3, 4, then 5 letters).
    for (let n = minN; n <= maxN; n++) {
      let offset = 0; // where we start cutting inside the word

      // Take the first piece of size n.
      grams.push(w.slice(offset, offset + n));

      // Slide along the word one letter at a time, taking a piece each step,
      // until we reach the end of the word.
      while (offset + n < w.length) {
        offset += 1;
        grams.push(w.slice(offset, offset + n));
      }

      // If the word was so short that we never slid along, bigger pieces would
      // just repeat the same thing, so we stop early. (Python does the same.)
      if (offset === 0) break; // short word: count it only once
    }
  }
  return grams;
}

// ---------- STEP 3: ADD UP THE VOTES ----------
// Returns the probability (0 to 1) that the text is a scam.
function predictScamProbability(model, text) {
  // The piece sizes saved in model.json (2 and 5), so we always cut the same way as training.
  const minN = model.ngram_range[0];
  const maxN = model.ngram_range[1];

  // A safe way to ask "does this piece exist in the model's notes?"
  const has = Object.prototype.hasOwnProperty;

  // 3a. COUNT THE PIECES THE MODEL KNOWS.
  // We cut up the SMS, and for each piece the model learned during training,
  // we count how many times it appears. Pieces the model has never seen are ignored.
  // count only the n-grams the model knows
  const counts = {};
  for (const g of charWbNgrams(text, minN, maxN)) {
    if (has.call(model.weights, g)) {
      counts[g] = (counts[g] || 0) + 1;
    }
  }

  // 3b. GIVE EACH PIECE AN IMPORTANCE NUMBER (TF-IDF).
  // importance = (how often it appears here) x (how special/rare the piece is overall).
  // Rare pieces matter more than pieces found in every message.
  // TF-IDF values, then L2 normalisation
  const tfidf = {};
  let sumSquares = 0;
  for (const g in counts) {
    // If a piece repeats many times we dampen it with a logarithm,
    // so repeating something 10 times does not count 10 times as much.
    const tf = model.sublinear_tf ? 1 + Math.log(counts[g]) : counts[g];

    // model.weights[g] holds two numbers for this piece: [idf, coefficient].
    const value = tf * model.weights[g][0]; // [0] = idf
    tfidf[g] = value;
    sumSquares += value * value; // collect this for the "balancing" step below
  }

  // 3c. BALANCE FOR MESSAGE LENGTH ("normalising").
  // We divide by the overall size so a long SMS does not automatically score higher
  // than a short one just because it has more pieces.
  // "|| 1" is a safety net: if nothing matched (the total is 0) we use 1,
  // to avoid dividing by zero.
  const norm = Math.sqrt(sumSquares) || 1;

  // 3d. LET EACH PIECE VOTE.
  // Start from the model's starting score (the "intercept"), then for every piece
  // add: its importance x its vote. Votes above 0 push toward SCAM,
  // votes below 0 push toward LEGIT.
  // logistic regression: weighted sum -> probability
  let z = model.intercept;
  for (const g in tfidf) {
    z += (tfidf[g] / norm) * model.weights[g][1]; // [1] = coefficient
  }

  // 3e. SQUASH THE TOTAL INTO A PERCENTAGE.
  // z can be any number (-5, 0, 3.2 ...). This formula (called the sigmoid)
  // turns it into a number between 0 and 1:
  //   very negative z -> close to 0 (legit)
  //   z = 0           -> exactly 0.5 (unsure)
  //   very positive z -> close to 1 (scam)
  return 1 / (1 + Math.exp(-z));
}

// ---------- STEP 4: THE ONE FUNCTION THE POPUP CALLS ----------
// Returns a score from 0 to 100, or null if the model isn't available.
async function getModelScore(text) {
  // Make sure the model is loaded (this waits for loadModel to finish).
  const model = await loadModel();

  // No model found? Return null, and popup.js will show "Model not loaded"
  // and use only the rules score instead.
  if (!model) return null;

  // Get the probability (0 to 1), multiply by 100, and round to a whole number.
  // For example, 0.92 becomes 92.
  return Math.round(predictScamProbability(model, text) * 100);
}
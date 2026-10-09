// ml.js - runs the trained model (model.json) inside the extension.
// The n-gram logic copies scikit-learn's "char_wb" analyzer so results match training.

let MODEL = null;

async function loadModel() {
  if (MODEL) return MODEL;
  try {
    const res = await fetch("model.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    MODEL = await res.json();
  } catch (err) {
    console.warn("Could not load model.json:", err);
    MODEL = null;
  }
  return MODEL;
}

// Splits text into words, pads each word with spaces, then takes every
// piece of length minN..maxN (e.g. " pin " -> " p", "pi", "in", "n ", " pi", ...).
function charWbNgrams(text, minN, maxN) {
  const grams = [];
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);

  for (const word of words) {
    const w = " " + word + " ";
    for (let n = minN; n <= maxN; n++) {
      let offset = 0;
      grams.push(w.slice(offset, offset + n));
      while (offset + n < w.length) {
        offset += 1;
        grams.push(w.slice(offset, offset + n));
      }
      if (offset === 0) break; // short word: count it only once
    }
  }
  return grams;
}

// Returns the probability (0 to 1) that the text is a scam.
function predictScamProbability(model, text) {
  const minN = model.ngram_range[0];
  const maxN = model.ngram_range[1];
  const has = Object.prototype.hasOwnProperty;

  // count only the n-grams the model knows
  const counts = {};
  for (const g of charWbNgrams(text, minN, maxN)) {
    if (has.call(model.weights, g)) {
      counts[g] = (counts[g] || 0) + 1;
    }
  }

  // TF-IDF values, then L2 normalisation
  const tfidf = {};
  let sumSquares = 0;
  for (const g in counts) {
    const tf = model.sublinear_tf ? 1 + Math.log(counts[g]) : counts[g];
    const value = tf * model.weights[g][0]; // [0] = idf
    tfidf[g] = value;
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares) || 1;

  // logistic regression: weighted sum -> probability
  let z = model.intercept;
  for (const g in tfidf) {
    z += (tfidf[g] / norm) * model.weights[g][1]; // [1] = coefficient
  }
  return 1 / (1 + Math.exp(-z));
}

// Returns a score from 0 to 100, or null if the model isn't available.
async function getModelScore(text) {
  const model = await loadModel();
  if (!model) return null;
  return Math.round(predictScamProbability(model, text) * 100);
}
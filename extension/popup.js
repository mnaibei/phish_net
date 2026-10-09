const input = document.getElementById("sms-input");
const analyzeBtn = document.getElementById("analyze-btn");
const clearBtn = document.getElementById("clear-btn");
const resultBox = document.getElementById("result");
const verdict = document.getElementById("verdict");
const barFill = document.getElementById("bar-fill");
const breakdown = document.getElementById("breakdown");
const reasonsList = document.getElementById("reasons");

// How much each part counts toward the final score (should add up to 1)
const RULES_WEIGHT = 0.5;
const MODEL_WEIGHT = 0.5;

function levelFor(score) {
  if (score >= 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

analyzeBtn.addEventListener("click", async function () {
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  const rules = analyzeSms(text);         // from rules.js
  const modelScore = await getModelScore(text); // from ml.js (null if no model)
  showResult(rules, modelScore);
});

clearBtn.addEventListener("click", function () {
  input.value = "";
  resultBox.hidden = true;
  input.focus();
});

function showResult(rules, modelScore) {
  let finalScore = rules.score;
  if (modelScore !== null) {
    finalScore = Math.round(RULES_WEIGHT * rules.score + MODEL_WEIGHT * modelScore);
  }
  const level = levelFor(finalScore);

  resultBox.hidden = false;
  resultBox.className = "risk-" + level.toLowerCase();
  verdict.textContent = level + " risk - " + finalScore + "/100";
  barFill.style.width = finalScore + "%";

  if (modelScore === null) {
    breakdown.textContent = "Rules: " + rules.score + "/100 · Model not loaded (run training/train.py first)";
  } else {
    breakdown.textContent = "Rules: " + rules.score + "/100 · Model: " + modelScore + "/100";
  }

  const items = rules.reasons.map(function (r) {
    return (r.points > 0 ? "+" : "") + r.points + "  " + r.text;
  });
  if (modelScore !== null) {
    items.push("Text model: " + modelScore + "% chance this is a scam");
  }
  if (items.length === 0) {
    items.push("No warning signs found. Still be careful with unexpected messages.");
  }

  reasonsList.textContent = "";
  items.forEach(function (text) {
    const li = document.createElement("li");
    li.textContent = text; // textContent keeps pasted SMS text safe
    reasonsList.appendChild(li);
  });
}
const input = document.getElementById("sms-input");
const analyzeBtn = document.getElementById("analyze-btn");
const clearBtn = document.getElementById("clear-btn");
const resultBox = document.getElementById("result");
const verdict = document.getElementById("verdict");
const barFill = document.getElementById("bar-fill");
const reasonsList = document.getElementById("reasons");

analyzeBtn.addEventListener("click", function () {
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  showResult(analyzeSms(text));
});

clearBtn.addEventListener("click", function () {
  input.value = "";
  resultBox.hidden = true;
  input.focus();
});

function showResult(result) {
  resultBox.hidden = false;
  resultBox.className = "risk-" + result.level.toLowerCase();

  verdict.textContent = result.level + " risk - " + result.score + "/100";
  barFill.style.width = result.score + "%";

  reasonsList.textContent = "";

  if (result.reasons.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No warning signs found. Still be careful with unexpected messages.";
    reasonsList.appendChild(li);
    return;
  }

  result.reasons.forEach(function (r) {
    const li = document.createElement("li");
    const sign = r.points > 0 ? "+" : "";
    li.textContent = sign + r.points + "  " + r.text; // textContent keeps pasted SMS text safe
    reasonsList.appendChild(li);
  });
}
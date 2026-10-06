// rules.js - all detection logic. Edit the lists below to tune the checker.

// ---------- URL CHECK SETTINGS ----------
const SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd",
  "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "tiny.cc"
];

const SUSPICIOUS_TLDS = [
  ".xyz", ".top", ".click", ".live", ".icu", ".buzz",
  ".tk", ".ml", ".ga", ".cf", ".gq", ".work", ".support"
];

// If a link contains one of these words but is NOT an official domain, it's likely a fake.
const BRANDS = ["safaricom", "mpesa", "m-pesa", "equity", "kcb", "airtel", "ecitizen"];

// TODO (team): double-check these against the real company websites.
const OFFICIAL_DOMAINS = [
  "safaricom.co.ke", "safaricom.com",
  "equitybank.co.ke", "equitygroupholdings.com",
  "kcbgroup.com", "airtel.co.ke", "ecitizen.go.ke"
];

// ---------- KEYWORD RULES ----------
// Each rule counts ONCE, even if several patterns match.
// "patterns" are regular expressions written as strings (case-insensitive).
// A negative "points" value lowers the score (a sign the message is legit).
const KEYWORD_RULES = [
  {
    name: "Urgency / pressure",
    points: 15,
    patterns: [
      "urgent", "immediately", "act now", "last warning", "final notice",
      "within \\d+ ?(hours|hrs|hr|minutes|mins)",
      "expires? (today|soon|tonight)",
      "haraka", "mara moja", "sasa hivi"
    ]
  },
  {
    name: "Asks for PIN / OTP / password",
    points: 30,
    patterns: [
      "(send|share|give|enter|provide|reply with|confirm|tuma|toa|weka).{0,30}\\b(pin|otp|password|verification code|nambari ya siri)\\b",
      "verify your (account|identity|details)",
      "thibitisha (akaunti|taarifa)"
    ]
  },
  {
    name: "Prize / free stuff",
    points: 20,
    patterns: [
      "congratulations", "you('ve| have)? won", "\\bprize\\b", "lottery", "jackpot",
      "claim your", "free (money|airtime|data|bundles?|gift)",
      "umeshinda", "zawadi", "bahati nasibu"
    ]
  },
  {
    name: "Money sent 'by mistake' / asks to return money",
    points: 25,
    patterns: [
      "by mistake", "sent (to )?the wrong", "wrongly sent",
      "reverse (the )?(transaction|money|payment)",
      "return (the )?(money|amount|cash)",
      "kwa makosa", "rudisha (pesa|hela|fedha)", "nirudishie", "tumekosea"
    ]
  },
  {
    name: "Account threat",
    points: 20,
    patterns: [
      "account (will be |has been |is )?(suspended|blocked|locked|closed|deactivated|restricted)",
      "(suspended|blocked|locked|deactivated) account",
      "unauthori[sz]ed", "suspicious activity",
      "akaunti.{0,25}(imefungwa|itafungwa|imesimamishwa|imezuiwa)"
    ]
  },
  {
    name: "Asks you to click / visit a link",
    points: 10,
    patterns: [
      "click (here|the link|below|on)", "tap (here|the link)",
      "follow (this|the) link", "visit (the )?(link|website|site)",
      "bonyeza", "fungua (link|kiungo)"
    ]
  },
  {
    name: "Fee / loan / job offer",
    points: 20,
    patterns: [
      "(registration|processing|application|admin|clearance) fee",
      "job (offer|opportunity|vacancy)", "recruitment", "work from home",
      "loan.{0,25}(approved|ready|limit)",
      "fuliza.{0,25}(limit|boost|increase)",
      "ongeza (limit|fuliza)", "ongezeko la (limit|fuliza)"
    ]
  },
  {
    name: "Asks you to send money",
    points: 15,
    patterns: [
      "(send|tuma|deposit|transfer|lipa).{0,25}(ksh|kes|\\d{3,})"
    ]
  },
  {
    name: "Generic / impersonal greeting",
    points: 10,
    patterns: [
      "dear (customer|client|member|user|subscriber)",
      "mpendwa (mteja|mwanachama)",
      "(safaricom|kcb|equity|airtel) (customer care|support|team|official)",
      "this is (safaricom|kcb|equity|airtel)"
    ]
  },
  {
    name: "Looks like a normal M-Pesa confirmation (no link)",
    points: -15,
    onlyIfNoUrl: true,
    patterns: ["^[a-z0-9]{10} confirmed"]
  }
];

// ---------- URL HELPERS ----------
function extractUrls(text) {
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|co\.ke|ke|xyz|top|click|live|icu|buzz|tk|ml|ga|cf|gq|work|support|info|me|io|ly|gl|is|cc)\b(?:\/[^\s<>"']*)?/gi;
  const found = text.match(pattern) || [];
  // remove punctuation stuck to the end of a link, e.g. "...com."
  return found.map(function (u) { return u.replace(/[.,;:!?)\]]+$/, ""); });
}

function getHostname(url) {
  let host = url.replace(/^[a-z]+:\/\//i, ""); // remove http://
  host = host.split(/[\/?#]/)[0];              // remove path
  host = host.split("@").pop();                // remove user@
  host = host.split(":")[0];                   // remove :port
  return host.toLowerCase();
}

function checkUrl(url) {
  const results = [];
  const host = getHostname(url);

  if (SHORTENERS.includes(host)) {
    results.push({ points: 20, text: "Shortened link (" + host + ") hides the real destination" });
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    results.push({ points: 25, text: "Link uses an IP address (" + host + ") instead of a website name" });
  }

  if (SUSPICIOUS_TLDS.some(function (t) { return host.endsWith(t); })) {
    results.push({ points: 15, text: "Link ends in a suspicious domain type (" + host + ")" });
  }

  const isOfficial = OFFICIAL_DOMAINS.some(function (d) {
    return host === d || host.endsWith("." + d);
  });
  const brand = BRANDS.find(function (b) { return host.includes(b); });
  if (brand && !isOfficial) {
    results.push({ points: 30, text: "Link mentions '" + brand + "' but is not an official website (" + host + ")" });
  }

  if (host.split(".").length > 4) {
    results.push({ points: 10, text: "Link has many sub-domains (" + host + ")" });
  }

  if ((host.match(/-/g) || []).length >= 3) {
    results.push({ points: 10, text: "Link has many hyphens (" + host + ")" });
  }

  if (/^http:\/\//i.test(url)) {
    results.push({ points: 5, text: "Link is not secure (http instead of https)" });
  }

  return results;
}

// ---------- MAIN FUNCTION ----------
// Returns { score: 0-100, level: "Low" | "Medium" | "High", reasons: [...], urls: [...] }
function analyzeSms(rawText) {
  const text = rawText.trim().toLowerCase();
  const reasons = [];

  // 1. URL checks
  const urls = extractUrls(text);
  urls.forEach(function (u) {
    checkUrl(u).forEach(function (r) { reasons.push(r); });
  });

  // 2. Keyword checks
  KEYWORD_RULES.forEach(function (rule) {
    if (rule.onlyIfNoUrl && urls.length > 0) return;

    for (const p of rule.patterns) {
      const match = text.match(new RegExp(p, "i"));
      if (match) {
        reasons.push({ points: rule.points, text: rule.name + ' (matched: "' + match[0] + '")' });
        break; // count each rule only once
      }
    }
  });

  // 3. Total score, kept between 0 and 100
  let score = reasons.reduce(function (sum, r) { return sum + r.points; }, 0);
  score = Math.max(0, Math.min(100, score));

  let level = "Low";
  if (score >= 60) level = "High";
  else if (score >= 30) level = "Medium";

  return { score: score, level: level, reasons: reasons, urls: urls };
}

// Lets us test this file in Node too (ignored in the browser)
if (typeof module !== "undefined") {
  module.exports = { analyzeSms: analyzeSms };
}
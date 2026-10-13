/*
  WHAT THIS FILE DOES
  -------------------------------------
  This is the "checklist" part of the checker. When someone pastes an SMS,
  this file looks for known warning signs and gives points for each one found.
  More points = more suspicious.

  It does 3 things:
    1. LINK CHECKS:    looks at any website link in the message (fake-looking? shortened?).
    2. KEYWORD CHECKS: looks for scammy words and phrases in English and Swahili.
    3. ADDING UP:      adds the points into a risk score from 0 to 100.

  This file is the easiest one for the team to improve. You don't need to
  understand all the code: to tune the checker, just edit the LISTS and the
  POINTS in the sections marked "EDIT THIS".
*/

// rules.js - all detection logic. Edit the lists below to tune the checker.

// ============================================================
//  PART 1: SETTINGS FOR LINK CHECKS  (EDIT THIS)
// ============================================================

// Link shorteners. Scammers use them to HIDE where a link really goes.
// Example: bit.ly/3xYz could lead anywhere.
const SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd",
  "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "tiny.cc"
];

// Website endings that are cheap and often used by scammers.
// Real companies in Kenya usually use .com or .co.ke, not .xyz or .top.
const SUSPICIOUS_TLDS = [
  ".xyz", ".top", ".click", ".live", ".icu", ".buzz",
  ".tk", ".ml", ".ga", ".cf", ".gq", ".work", ".support"
];

// If a link contains one of these company names but is NOT that company's real
// website, it's likely a fake. Example: "safaricom-promo.xyz" is not Safaricom.
const BRANDS = ["safaricom", "mpesa", "m-pesa", "equity", "kcb", "airtel", "ecitizen"];

// The REAL websites of those companies. A link on this list is trusted.
// TODO (team): double-check these against the real company websites.
const OFFICIAL_DOMAINS = [
  "safaricom.co.ke", "safaricom.com",
  "equitybank.co.ke", "equitygroupholdings.com",
  "kcbgroup.com", "airtel.co.ke", "ecitizen.go.ke"
];

// ============================================================
//  PART 2: KEYWORD RULES
// ============================================================
// Each rule below is one "warning sign" with:
//   name     = what we call it (shown to the user in the results)
//   points   = how many risk points it adds
//   patterns = the words/phrases to look for
//
// Good to know:
//  - Each rule counts ONCE, even if several patterns match.
//  - Messages are made lowercase before checking, so write patterns in lowercase.
//  - Patterns are "regular expressions": a mini search language.
//    Special symbols you will see:
//        .{0,30}    = any 0 to 30 characters in between
//        \\d+       = one or more digits (numbers). Written with two \\ here.
//        \\b        = a word boundary (so "pin" does not match inside "spinach")
//        ( a | b )  = a OR b
//        ?          = the thing before it is optional
//        ^          = the start of the message
//  - A negative "points" value LOWERS the score (a sign the message is legit).
//
// Each rule counts ONCE, even if several patterns match.
// "patterns" are regular expressions written as strings (case-insensitive).
// A negative "points" value lowers the score (a sign the message is legit).
const KEYWORD_RULES = [
  // Scammers rush you so you don't have time to think.
  // Matches things like: "urgent", "within 24 hours", "haraka".
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

  // The biggest red flag: a real company will NEVER ask you to send your PIN.
  // Matches a "give/send" word followed (within 30 characters) by pin/otp/password,
  // for example "send your PIN" or "tuma nambari ya siri".
  {
    name: "Asks for PIN / OTP / password",
    points: 30,
    patterns: [
      "(send|share|give|enter|provide|reply with|confirm|tuma|toa|weka).{0,30}\\b(pin|otp|password|verification code|nambari ya siri)\\b",
      "verify your (account|identity|details)",
      "thibitisha (akaunti|taarifa)"
    ]
  },

  // "You won!" messages for a contest you never entered.
  {
    name: "Prize / free stuff",
    points: 20,
    patterns: [
      "congratulations", "you('ve| have)? won", "\\bprize\\b", "lottery", "jackpot",
      "claim your", "free (money|airtime|data|bundles?|gift)",
      "umeshinda", "zawadi", "bahati nasibu"
    ]
  },

  // A very common Kenyan scam: "I sent you money by mistake, please send it back".
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

  // Fear tactic: "your account will be blocked unless you act".
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

  // Pushing you to open a link. Low points, because normal messages do this too.
  {
    name: "Asks you to click / visit a link",
    points: 10,
    patterns: [
      "click (here|the link|below|on)", "tap (here|the link)",
      "follow (this|the) link", "visit (the )?(link|website|site)",
      "bonyeza", "fungua (link|kiungo)"
    ]
  },

  // Fake jobs, fake loans and fake Fuliza limit boosts that ask for a fee first.
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

  // "Send/pay" followed within 25 characters by "ksh", "kes" or a number of 3+ digits.
  // Example: "tuma Ksh 500", "send 1000".
  {
    name: "Asks you to send money",
    points: 15,
    patterns: [
      "(send|tuma|deposit|transfer|lipa).{0,25}(ksh|kes|\\d{3,})"
    ]
  },

  // Real companies usually use your name. Scammers write to "Dear customer".
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

  // A GOOD sign: this rule SUBTRACTS points. Real M-Pesa receipts start with a
  // 10-character code followed by "Confirmed". We only trust it if the message has no link.
  // (onlyIfNoUrl: true = skip this rule if a link was found)
  {
    name: "Looks like a normal M-Pesa confirmation (no link)",
    points: -15,
    onlyIfNoUrl: true,
    patterns: ["^[a-z0-9]{10} confirmed"]
  }
];

// ============================================================
//  PART 3: LINK HELPER FUNCTIONS
// ============================================================

// FINDS all the links in the message and returns them as a list.
// It spots links that start with http:// or www., and also "bare" ones
// like "bit.ly/abc" that end in a known website ending (.com, .co.ke, .xyz ...).
function extractUrls(text) {
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|co\.ke|ke|xyz|top|click|live|icu|buzz|tk|ml|ga|cf|gq|work|support|info|me|io|ly|gl|is|cc)\b(?:\/[^\s<>"']*)?/gi;
  const found = text.match(pattern) || [];
  // remove punctuation stuck to the end of a link, e.g. "...com."
  return found.map(function (u) { return u.replace(/[.,;:!?)\]]+$/, ""); });
}

// Gets just the website NAME out of a full link.
// Example: "http://safaricom-promo.xyz/claim?id=5" becomes "safaricom-promo.xyz".
// This matters because the name is what shows who really owns the link.
function getHostname(url) {
  let host = url.replace(/^[a-z]+:\/\//i, ""); // remove http://
  host = host.split(/[\/?#]/)[0];              // remove path
  host = host.split("@").pop();                // remove user@
  host = host.split(":")[0];                   // remove :port
  return host.toLowerCase();
}

// Runs ALL the link checks on ONE link and returns a list of problems found.
// Each problem has points and a plain-English explanation shown to the user.
function checkUrl(url) {
  const results = [];
  const host = getHostname(url);

  // Check 1: is it a link shortener? (hides the real destination)
  if (SHORTENERS.includes(host)) {
    results.push({ points: 20, text: "Shortened link (" + host + ") hides the real destination" });
  }

  // Check 2: does it use numbers like 192.168.4.5 instead of a name? Real companies don't.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    results.push({ points: 25, text: "Link uses an IP address (" + host + ") instead of a website name" });
  }

  // Check 3: does it end in a suspicious ending like .xyz or .top?
  if (SUSPICIOUS_TLDS.some(function (t) { return host.endsWith(t); })) {
    results.push({ points: 15, text: "Link ends in a suspicious domain type (" + host + ")" });
  }

  // Check 4 (the strongest one): FAKE BRAND LINK.
  // First: is the link on the official list? "host.endsWith('.' + d)" also allows
  // sub-pages like "web.safaricom.co.ke".
  const isOfficial = OFFICIAL_DOMAINS.some(function (d) {
    return host === d || host.endsWith("." + d);
  });
  // Then: does the link name contain a company name (like "safaricom")?
  const brand = BRANDS.find(function (b) { return host.includes(b); });
  // Uses a company name BUT is not on the official list = pretending to be them.
  if (brand && !isOfficial) {
    results.push({ points: 30, text: "Link mentions '" + brand + "' but is not an official website (" + host + ")" });
  }

  // Check 5: too many sub-domains (like a.b.c.d.example.com) is a trick to look official.
  if (host.split(".").length > 4) {
    results.push({ points: 10, text: "Link has many sub-domains (" + host + ")" });
  }

  // Check 6: 3 or more hyphens (like secure-login-safaricom-pay.com) looks made up.
  if ((host.match(/-/g) || []).length >= 3) {
    results.push({ points: 10, text: "Link has many hyphens (" + host + ")" });
  }

  // Check 7: starts with http:// rather than https:// (not secure). Small penalty.
  if (/^http:\/\//i.test(url)) {
    results.push({ points: 5, text: "Link is not secure (http instead of https)" });
  }

  return results;
}

// ============================================================
//  PART 4: THE MAIN FUNCTION  (the popup calls this)
// ============================================================
// Takes the pasted SMS and returns the result:
//   score   = 0 to 100
//   level   = "Low", "Medium" or "High"
//   reasons = the list of warning signs found (with points)
//   urls    = the links found in the message
// Returns { score: 0-100, level: "Low" | "Medium" | "High", reasons: [...], urls: [...] }
function analyzeSms(rawText) {
  // Clean the message first: turn any gaps and line breaks into a single space,
  // trim the ends, and make everything lowercase so searches are consistent.
  const text = rawText.replace(/\s+/g, " ").trim().toLowerCase();

  // The list where we collect every warning sign we find.
  const reasons = [];

  // 1. URL checks
  // Find the links, then run all the link checks on each one and collect the problems.
  const urls = extractUrls(text);
  urls.forEach(function (u) {
    checkUrl(u).forEach(function (r) { reasons.push(r); });
  });

  // 2. Keyword checks
  // Go through the keyword rules one by one.
  KEYWORD_RULES.forEach(function (rule) {
    // Skip the "normal M-Pesa confirmation" rule if the message contains a link.
    if (rule.onlyIfNoUrl && urls.length > 0) return;

    // Try each pattern of this rule against the message.
    for (const p of rule.patterns) {
      const match = text.match(new RegExp(p, "i"));
      if (match) {
        // Found one: record the rule, its points and the exact words that matched.
        reasons.push({ points: rule.points, text: rule.name + ' (matched: "' + match[0] + '")' });
        break; // count each rule only once
      }
    }
  });

  // 3. Total score, kept between 0 and 100
  // Add up all the points. Math.min/Math.max keep the result from going
  // below 0 or above 100.
  let score = reasons.reduce(function (sum, r) { return sum + r.points; }, 0);
  score = Math.max(0, Math.min(100, score));

  // Turn the number into a label: 60+ is High, 30 to 59 is Medium, below 30 is Low.
  let level = "Low";
  if (score >= 60) level = "High";
  else if (score >= 30) level = "Medium";

  return { score: score, level: level, reasons: reasons, urls: urls };
}

// Lets us test this file in Node too (ignored in the browser)
// (this is only for developers; the extension works without it)
if (typeof module !== "undefined") {
  module.exports = { analyzeSms: analyzeSms };
}
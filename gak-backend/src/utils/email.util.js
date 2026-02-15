const KEYWORDS = ["assignment", "deadline", "nptel", "hackathon", "submission"];

function isRelevantAcademicEmail(text) {
  const value = String(text || "").toLowerCase();
  return KEYWORDS.some((keyword) => value.includes(keyword));
}

function extractDeadline(text) {
  const dateRegexes = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/
  ];

  for (const regex of dateRegexes) {
    const match = String(text || "").match(regex);
    if (!match) {
      continue;
    }

    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

module.exports = {
  isRelevantAcademicEmail,
  extractDeadline
};

const ACADEMIC_ACTION_KEYWORDS = [
  "assignment",
  "deadline",
  "submission",
  "submit",
  "due",
  "turn in",
  "turned in",
  "quiz",
  "test",
  "internal",
  "midsem",
  "mid sem",
  "endsem",
  "end sem",
  "exam",
  "exam registration",
  "registration",
  "project",
  "viva",
  "lab",
  "practical",
  "last date",
  "last day"
];

const ACADEMIC_PLATFORM_KEYWORDS = [
  "nptel",
  "study.iitm",
  "classroom",
  "google classroom",
  "course instructor",
  "course material"
];

const NEGATIVE_PROMO_KEYWORDS = [
  "offer",
  "sale",
  "discount",
  "coupon",
  "invoice",
  "payment failed",
  "payment reminder",
  "delivery",
  "amazon",
  "uber",
  "rapido",
  "roles",
  "jobs",
  "unsubscribe",
  "newsletter"
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function containsAny(text, words) {
  const src = String(text || "").toLowerCase();
  return (words || []).some((word) => src.includes(String(word).toLowerCase()));
}

function extractEmailAddress(fromValue) {
  const text = String(fromValue || "").trim().toLowerCase();
  if (!text) return "";
  const bracket = text.match(/<([^>]+)>/);
  if (bracket && bracket[1]) return bracket[1].trim();
  const plain = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return plain ? plain[0].toLowerCase() : text;
}

function isAcademicSender(fromValue) {
  const sender = extractEmailAddress(fromValue);
  if (!sender) return false;
  return (
    sender.includes("classroom.google.com")
    || sender.endsWith("@classroom.google.com")
    || sender.includes("nptel")
    || sender.includes("study.iitm.ac.in")
    || sender.includes("srmist.edu.in")
  );
}

function isLikelyAcademicDeadlineTitle(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  const hasAction = containsAny(text, ACADEMIC_ACTION_KEYWORDS);
  const hasPlatform = containsAny(text, ACADEMIC_PLATFORM_KEYWORDS);
  const hasStrongAcademicCue = /assignment|submission|quiz|test|internal|midsem|endsem|exam|viva|project|lab|classroom|nptel|registration|course|semester|cie|cat|ft-i|ft-ii/i.test(text);
  const hasPromo = containsAny(text, NEGATIVE_PROMO_KEYWORDS);
  if (hasPromo && !hasPlatform) return false;
  return hasStrongAcademicCue || (hasPlatform && hasAction);
}

function isRelevantAcademicEmail(text, fromValue = "") {
  const src = normalizeText(text);
  if (!src) return false;
  const hasAction = containsAny(src, ACADEMIC_ACTION_KEYWORDS);
  const hasPlatform = containsAny(src, ACADEMIC_PLATFORM_KEYWORDS);
  const hasPromo = containsAny(src, NEGATIVE_PROMO_KEYWORDS);
  const senderAcademic = isAcademicSender(fromValue);
  if (hasPromo && !senderAcademic && !hasPlatform) return false;
  return hasAction && (senderAcademic || hasPlatform);
}

function monthToIndex(mon) {
  const m = String(mon || "").toLowerCase().slice(0, 3);
  const map = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  return Object.prototype.hasOwnProperty.call(map, m) ? map[m] : null;
}

function normalizeYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n < 100) {
    // 2-digit years: interpret 00-79 as 2000-2079, 80-99 as 1980-1999.
    return n <= 79 ? 2000 + n : 1900 + n;
  }
  return n;
}

function pickClosestFutureDate(candidate, now, maxDaysAhead = 200) {
  if (!candidate || Number.isNaN(candidate.getTime())) return null;
  const deltaDays = (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (deltaDays >= -2 && deltaDays <= maxDaysAhead) return candidate;
  return null;
}

function extractKeywordWindows(text) {
  const src = String(text || "");
  const windows = [];
  const re = /\b(due|deadline|submission|exam registration|last date|last day|register by|closes on)\b/ig;
  let m;
  while ((m = re.exec(src))) {
    const start = Math.max(0, m.index - 80);
    const end = Math.min(src.length, m.index + 220);
    windows.push(src.slice(start, end));
  }
  return windows;
}

function extractDeadline(text) {
  const src = normalizeText(text);
  const now = new Date();
  const candidateTexts = [...extractKeywordWindows(src), src];

  // "tomorrow" / "today" with deadline-ish language.
  if (/\b(due|deadline|last date|submission|register by|closes on)\b/i.test(src)) {
    if (/\btomorrow\b/i.test(src)) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() + 1);
      dt.setHours(23, 59, 0, 0);
      return dt;
    }
    if (/\btoday\b/i.test(src) || /\btonight\b/i.test(src)) {
      const dt = new Date(now);
      dt.setHours(23, 59, 0, 0);
      return dt;
    }
  }

  for (const segment of candidateTexts) {
    // ISO-like.
    {
      const m = segment.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (m) {
        const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    }

    // dd/mm/yyyy or dd-mm-yy
    {
      const m = segment.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
      if (m) {
        const year = normalizeYear(m[3]);
        const dt = new Date(Number(year), Number(m[2]) - 1, Number(m[1]), 23, 59, 0, 0);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    }

    // "Due Feb 16" / "Due Feb 16, 2026" / "Due Feb 16 at 11:59 PM"
    {
      const m = segment.match(
        /\b(?:due|deadline|last date|last day|submission deadline|register by|closes on)\s*(?:on\s*)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:,)?\s*(\d{4})?(?:\s*(?:at)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i
      );
      if (m) {
        const mon = monthToIndex(m[1]);
        const day = Number(m[2]);
        const year = m[3] ? normalizeYear(m[3]) : now.getFullYear();
        const hourRaw = m[4] ? Number(m[4]) : 23;
        const minRaw = m[5] ? Number(m[5]) : 59;
        const ampm = String(m[6] || "").toLowerCase();
        let hour = hourRaw;
        if (ampm === "pm" && hour < 12) hour += 12;
        if (ampm === "am" && hour === 12) hour = 0;
        const dt = new Date(Number(year), Number(mon), day, hour, minRaw, 0, 0);
        const picked = pickClosestFutureDate(dt, now);
        if (picked) return picked;
        if (!m[3]) {
          const dt2 = new Date(now.getFullYear() + 1, Number(mon), day, hour, minRaw, 0, 0);
          const picked2 = pickClosestFutureDate(dt2, now, 220);
          if (picked2) return picked2;
        }
      }
    }

    // "15 Feb 2026" / "15 Feb"
    {
      const m = segment.match(/\b(\d{1,2})\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})?\b/i);
      if (m) {
        const day = Number(m[1]);
        const mon = monthToIndex(m[2]);
        const year = m[3] ? normalizeYear(m[3]) : now.getFullYear();
        const dt = new Date(Number(year), Number(mon), day, 23, 59, 0, 0);
        const picked = pickClosestFutureDate(dt, now);
        if (picked) return picked;
        if (!m[3]) {
          const dt2 = new Date(now.getFullYear() + 1, Number(mon), day, 23, 59, 0, 0);
          const picked2 = pickClosestFutureDate(dt2, now, 220);
          if (picked2) return picked2;
        }
      }
    }

    // "Feb 15, 2026" / "Feb 15"
    {
      const m = segment.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:,)?\s*(\d{4})?\b/i);
      if (m) {
        const mon = monthToIndex(m[1]);
        const day = Number(m[2]);
        const year = m[3] ? normalizeYear(m[3]) : now.getFullYear();
        const dt = new Date(Number(year), Number(mon), day, 23, 59, 0, 0);
        const picked = pickClosestFutureDate(dt, now);
        if (picked) return picked;
        if (!m[3]) {
          const dt2 = new Date(now.getFullYear() + 1, Number(mon), day, 23, 59, 0, 0);
          const picked2 = pickClosestFutureDate(dt2, now, 220);
          if (picked2) return picked2;
        }
      }
    }
  }

  return null;
}

function analyzeAcademicEmail({ subject = "", snippet = "", bodyText = "", from = "" } = {}) {
  const content = normalizeText(`${subject}\n${snippet}\n${bodyText}`);
  const senderAcademic = isAcademicSender(from);
  const hasAction = containsAny(content, ACADEMIC_ACTION_KEYWORDS);
  const hasPlatform = containsAny(content, ACADEMIC_PLATFORM_KEYWORDS);
  const hasPromo = containsAny(content, NEGATIVE_PROMO_KEYWORDS);

  const relevant = (
    hasAction
    && (senderAcademic || hasPlatform)
    && !(hasPromo && !senderAcademic && !hasPlatform)
  );

  const parsedDeadline = relevant ? extractDeadline(content) : null;
  const confidence = !relevant
    ? 0.15
    : parsedDeadline && senderAcademic
      ? 0.95
      : parsedDeadline
        ? 0.8
        : 0.55;

  return {
    relevant,
    parsedDeadline,
    confidence,
    senderAcademic,
    hasPlatform,
    hasAction,
    hasPromo
  };
}

function decodeBase64Url(data) {
  const raw = String(data || "").trim();
  if (!raw) return "";
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  // Gmail base64url may omit padding.
  const padLen = (4 - (padded.length % 4)) % 4;
  const withPad = padded + "=".repeat(padLen);
  try {
    return Buffer.from(withPad, "base64").toString("utf8");
  } catch (_error) {
    return "";
  }
}

function stripHtml(html) {
  const text = String(html || "");
  // Very small heuristic: remove tags and collapse whitespace.
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectGmailBodies(part, out) {
  if (!part) return;
  const mime = String(part.mimeType || "").toLowerCase();

  const bodyData = part.body && typeof part.body.data === "string" ? part.body.data : null;
  if (bodyData && (mime === "text/plain" || mime === "text/html" || !mime)) {
    const decoded = decodeBase64Url(bodyData);
    if (decoded) {
      out.push(mime === "text/html" ? stripHtml(decoded) : decoded);
    }
  }

  const parts = Array.isArray(part.parts) ? part.parts : [];
  for (const child of parts) {
    collectGmailBodies(child, out);
  }
}

function extractGmailMessageText(payload) {
  if (!payload) return "";
  const out = [];
  collectGmailBodies(payload, out);
  return out.join("\n").replace(/\s+\n/g, "\n").trim();
}

module.exports = {
  isRelevantAcademicEmail,
  isLikelyAcademicDeadlineTitle,
  analyzeAcademicEmail,
  extractDeadline,
  extractGmailMessageText
};

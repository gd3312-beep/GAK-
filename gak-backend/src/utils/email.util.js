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
  "job",
  "hiring",
  "internship",
  "market research",
  "newsletter",
  "challenge",
  "launch",
  "prize",
  "prizes",
  "shipping",
  "ship",
  "product update",
  "invitation",
  "workshop",
  "conclave",
  "abstract submission",
  "unsubscribe",
  "webinar"
];

const DEADLINE_SIGNAL_KEYWORDS = [
  "due",
  "deadline",
  "last date",
  "last day",
  "submission",
  "submit by",
  "register by",
  "closes on",
  "extended till",
  "extended until"
];

const REGISTRATION_SIGNAL_KEYWORDS = [
  "you are registered",
  "registration successful",
  "successfully registered",
  "you are enrolled",
  "enrollment confirmed",
  "registration confirmed",
  "payment successful"
];

const COMPLETION_SIGNAL_KEYWORDS = [
  "course completed",
  "completed successfully",
  "certificate issued",
  "course has ended",
  "classroom archived",
  "enrollment ended"
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

function cleanSourceName(value) {
  return String(value || "")
    .replace(/^(re:|fwd:)\s*/ig, "")
    .replace(/^(new announcement|new material|new assignment|announcement|reminder|due tomorrow)\s*:\s*/ig, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function buildSourceKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function detectProviderCode({ sender = "", content = "" } = {}) {
  const src = String(content || "").toLowerCase();
  const from = String(sender || "").toLowerCase();
  if (!src && !from) return "other";

  if (from.includes("nptel") || from.includes("study.iitm") || src.includes("nptel") || src.includes("study.iitm")) {
    return "nptel";
  }
  if (
    from.includes("classroom.google.com")
    || from.includes("no-reply@classroom.google.com")
    || from.includes("noreply@classroom.google.com")
    || src.includes("classroom.google.com")
    || src.includes("google classroom")
  ) {
    return "classroom";
  }
  if (from.includes("srmist.edu.in") || src.includes("srm") || src.includes("academia.srmist")) {
    return "college";
  }
  if (from.includes("coursera") || src.includes("coursera")) {
    return "coursera";
  }
  if (from.includes("udemy") || src.includes("udemy")) {
    return "udemy";
  }
  if (from.includes("devpost") || from.includes("unstop") || from.includes("kaggle") || src.includes("hackathon")) {
    return "hackathon";
  }
  return "other";
}

function hasRegistrationSignal(content) {
  const src = String(content || "").toLowerCase();
  if (containsAny(src, REGISTRATION_SIGNAL_KEYWORDS)) return true;
  return /\b(you(?:'| a)?re registered|registration (?:is )?successful|successfully registered|you(?:'| a)?re enrolled|enrollment confirmed|registration confirmed|payment successful)\b/i.test(src);
}

function hasCompletionSignal(content) {
  const src = String(content || "").toLowerCase();
  return containsAny(src, COMPLETION_SIGNAL_KEYWORDS);
}

function deriveAcademicSource({ subject = "", snippet = "", bodyText = "", from = "" } = {}) {
  const sender = extractEmailAddress(from);
  const content = normalizeText(`${subject}\n${snippet}\n${bodyText}`);
  const providerCode = detectProviderCode({ sender, content });
  const sourceType = providerCode === "classroom"
    ? "classroom"
    : providerCode === "hackathon"
      ? "hackathon"
      : providerCode === "other"
        ? "other"
        : "course";

  const name = cleanSourceName(subject || snippet || "");
  const sourceName = name || cleanSourceName(content.slice(0, 160));
  const sourceKey = buildSourceKey(sourceName);
  if (!sourceName || !sourceKey) {
    return null;
  }

  return {
    providerCode,
    sourceType,
    sourceName,
    sourceKey,
    senderEmail: sender || null,
    registrationSignal: hasRegistrationSignal(content),
    completionSignal: hasCompletionSignal(content)
  };
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
  const hasStrongAcademicCue = /assignment|submission|quiz|test|internal|midsem|endsem|exam|viva|project|lab|classroom|nptel|registration|ft-i|ft-ii/i.test(text);
  const hasDeadlineSignal = containsAny(text, DEADLINE_SIGNAL_KEYWORDS) || /\b(till|until)\b/.test(text);
  const hasPromo = containsAny(text, NEGATIVE_PROMO_KEYWORDS);
  if (hasPromo) return false;
  return (hasStrongAcademicCue && (hasDeadlineSignal || hasAction)) || (hasPlatform && hasAction && hasDeadlineSignal);
}

function isRelevantAcademicEmail(text, fromValue = "") {
  const src = normalizeText(text);
  if (!src) return false;
  const hasAction = containsAny(src, ACADEMIC_ACTION_KEYWORDS);
  const hasPlatform = containsAny(src, ACADEMIC_PLATFORM_KEYWORDS);
  const hasPromo = containsAny(src, NEGATIVE_PROMO_KEYWORDS);
  const senderAcademic = isAcademicSender(fromValue);
  if (hasPromo) return false;
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

function hasExplicitDateMention(text) {
  const src = String(text || "");
  if (!src) return false;
  return /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*\d{1,2})\b/i.test(src);
}

function hasDeadlineIntent(text) {
  const src = String(text || "").toLowerCase();
  if (!src) return false;
  if (containsAny(src, DEADLINE_SIGNAL_KEYWORDS)) return true;
  if (
    /\b(until|till|by|to)\b/.test(src)
    && /\b(assignment|submission|submit|quiz|test|exam|project|lab|practical|registration|hackathon)\b/.test(src)
  ) {
    return true;
  }
  // Common registration phrasing: "extended till/until <date>".
  if ((src.includes("registration") || src.includes("exam")) && /\b(extended|till|until|last day|last date|register by)\b/.test(src)) {
    return true;
  }
  return false;
}

function extractKeywordWindows(text) {
  const src = String(text || "");
  const windows = [];
  const re = /\b(due|deadline|submission|assignment|exam registration|registration|last date|last day|register by|closes on|extended till|extended until|until|till)\b/ig;
  let m;
  while ((m = re.exec(src))) {
    const start = Math.max(0, m.index - 80);
    const end = Math.min(src.length, m.index + 220);
    windows.push(src.slice(start, end));
  }
  return windows;
}

function normalizeHourMinute(hourRaw, minuteRaw, ampmRaw) {
  const minute = Number.isFinite(Number(minuteRaw)) ? Number(minuteRaw) : 59;
  let hour = Number.isFinite(Number(hourRaw)) ? Number(hourRaw) : 23;
  const ampm = String(ampmRaw || "").toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) hour = 23;
  if (minute < 0 || minute > 59) return { hour, minute: 59 };
  return { hour, minute };
}

function parseTrailingTime(segment, afterIndex) {
  const tail = String(segment || "").slice(afterIndex, afterIndex + 32);
  const m = tail.match(/^\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) {
    return { hour: 23, minute: 59 };
  }
  return normalizeHourMinute(m[1], m[2], m[3]);
}

function scoreDeadlineContext(localContext) {
  const text = String(localContext || "").toLowerCase();
  if (!text) return 0;

  let score = 0;

  if (/\b(last date|last day|final deadline|submission deadline|deadline|due date|due|submit by|register by|closes on|extended till|extended until|extended to|until|till|by)\b/.test(text)) {
    score += 5;
  }
  if (/\b(extended|final)\b/.test(text)) {
    score += 2;
  }
  if (/\b(assignment|quiz|test|exam|project|lab|practical|registration|hackathon)\b/.test(text)) {
    score += 1;
  }
  if (/\b(starts on|starting on|starting from|starts from|open from|opened on|from|begin|begins|published on|posted on|created on|announced on)\b/.test(text)) {
    score -= 4;
  }
  if (/\b(result|attendance|invoice|payment)\b/.test(text)) {
    score -= 2;
  }

  return score;
}

function scoreDeadlineMatch(segment, matchIndex, matchLength) {
  const src = String(segment || "").toLowerCase();
  const before = src.slice(Math.max(0, matchIndex - 42), matchIndex);
  const after = src.slice(matchIndex + matchLength, Math.min(src.length, matchIndex + matchLength + 42));
  const near = `${before} ${after}`;
  let score = scoreDeadlineContext(near);

  if (/\b(last date|last day|deadline|due|submit by|register by|closes on|until|till|by)\s*$/.test(before)) {
    score += 3;
  }
  if (/\b(opens on|open from|starts on|starting from|from)\s*$/.test(before)) {
    score -= 5;
  }
  if (/^\s*\b(closes on|until|till|by)\b/.test(after)) {
    score += 3;
  }
  if (/^\s*\b(to|through)\b/.test(after) && /\bfrom\b/.test(before)) {
    score -= 2;
  }
  return score;
}

function pushDeadlineCandidate(candidates, {
  now,
  date,
  score,
  localContext
}) {
  const picked = pickClosestFutureDate(date, now, 300);
  if (!picked) return;
  if (!Number.isFinite(Number(score)) || Number(score) <= 0) return;

  const key = `${picked.getFullYear()}-${picked.getMonth()}-${picked.getDate()}-${picked.getHours()}-${picked.getMinutes()}`;
  const existing = candidates.find((candidate) => candidate.key === key);
  if (existing) {
    existing.score = Math.max(existing.score, score);
    if (String(localContext || "").length > String(existing.context || "").length) {
      existing.context = localContext;
    }
    return;
  }
  candidates.push({
    key,
    date: picked,
    score,
    context: localContext
  });
}

function collectDeadlineCandidatesFromSegment(segment, now, candidates) {
  const src = String(segment || "");
  if (!src) return;
  const lowered = src.toLowerCase();

  // Range pattern: "13 February ... till 20" or "13 February ... until 20 February".
  for (const m of src.matchAll(/\b(\d{1,2})\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})?[\s,\-–—:]{0,60}\b(?:to|till|until|through)\b[\s,\-–—:]{0,20}(\d{1,2})(?:\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))?\s*(\d{4})?\b/ig)) {
    const fromDay = Number(m[1]);
    const fromMonth = monthToIndex(m[2]);
    const fromYear = m[3] ? normalizeYear(m[3]) : now.getFullYear();
    const toDay = Number(m[4]);
    const toMonth = m[5] ? monthToIndex(m[5]) : fromMonth;
    const toYear = m[6] ? normalizeYear(m[6]) : fromYear;
    if (!Number.isFinite(fromDay) || !Number.isFinite(toDay) || fromMonth === null || toMonth === null || !toYear) {
      continue;
    }
    const dt = new Date(Number(toYear), Number(toMonth), toDay, 23, 59, 0, 0);
    const from = Math.max(0, m.index - 64);
    const to = Math.min(src.length, m.index + String(m[0]).length + 64);
    const local = lowered.slice(from, to);
    const score = Math.max(8, scoreDeadlineMatch(src, m.index || 0, String(m[0]).length) + 4);
    pushDeadlineCandidate(candidates, { now, date: dt, score, localContext: local });
  }

  // Range pattern: "February 13 ... till 20" or "February 13 ... until February 20".
  for (const m of src.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})\s*(\d{4})?[\s,\-–—:]{0,60}\b(?:to|till|until|through)\b[\s,\-–—:]{0,20}(\d{1,2})(?:\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))?\s*(\d{4})?\b/ig)) {
    const fromMonth = monthToIndex(m[1]);
    const fromDay = Number(m[2]);
    const fromYear = m[3] ? normalizeYear(m[3]) : now.getFullYear();
    const toDay = Number(m[4]);
    const toMonth = m[5] ? monthToIndex(m[5]) : fromMonth;
    const toYear = m[6] ? normalizeYear(m[6]) : fromYear;
    if (!Number.isFinite(fromDay) || !Number.isFinite(toDay) || fromMonth === null || toMonth === null || !toYear) {
      continue;
    }
    const dt = new Date(Number(toYear), Number(toMonth), toDay, 23, 59, 0, 0);
    const from = Math.max(0, m.index - 64);
    const to = Math.min(src.length, m.index + String(m[0]).length + 64);
    const local = lowered.slice(from, to);
    const score = Math.max(8, scoreDeadlineMatch(src, m.index || 0, String(m[0]).length) + 4);
    pushDeadlineCandidate(candidates, { now, date: dt, score, localContext: local });
  }

  for (const m of src.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 0, 0);
    const from = Math.max(0, m.index - 56);
    const to = Math.min(src.length, m.index + m[0].length + 56);
    const local = lowered.slice(from, to);
    pushDeadlineCandidate(candidates, { now, date: dt, score: scoreDeadlineMatch(src, m.index || 0, String(m[0]).length), localContext: local });
  }

  for (const m of src.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g)) {
    const year = normalizeYear(m[3]);
    if (!year) continue;
    const dt = new Date(Number(year), Number(m[2]) - 1, Number(m[1]), 23, 59, 0, 0);
    const from = Math.max(0, m.index - 56);
    const to = Math.min(src.length, m.index + m[0].length + 56);
    const local = lowered.slice(from, to);
    pushDeadlineCandidate(candidates, { now, date: dt, score: scoreDeadlineMatch(src, m.index || 0, String(m[0]).length), localContext: local });
  }

  for (const m of src.matchAll(/\b(\d{1,2})\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})?\b/ig)) {
    const day = Number(m[1]);
    const mon = monthToIndex(m[2]);
    if (mon === null || mon === undefined) continue;
    const year = m[3] ? normalizeYear(m[3]) : now.getFullYear();
    const { hour, minute } = parseTrailingTime(src, (m.index || 0) + String(m[0]).length);
    const dt = new Date(Number(year), Number(mon), day, hour, minute, 0, 0);
    const from = Math.max(0, m.index - 56);
    const to = Math.min(src.length, m.index + m[0].length + 56);
    const local = lowered.slice(from, to);
    const score = scoreDeadlineMatch(src, m.index || 0, String(m[0]).length);
    pushDeadlineCandidate(candidates, { now, date: dt, score, localContext: local });
    if (!m[3]) {
      const dt2 = new Date(now.getFullYear() + 1, Number(mon), day, hour, minute, 0, 0);
      pushDeadlineCandidate(candidates, { now, date: dt2, score, localContext: local });
    }
  }

  for (const m of src.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:,)?\s*(\d{4})?\b/ig)) {
    const mon = monthToIndex(m[1]);
    if (mon === null || mon === undefined) continue;
    const day = Number(m[2]);
    const year = m[3] ? normalizeYear(m[3]) : now.getFullYear();
    const { hour, minute } = parseTrailingTime(src, (m.index || 0) + String(m[0]).length);
    const dt = new Date(Number(year), Number(mon), day, hour, minute, 0, 0);
    const from = Math.max(0, m.index - 56);
    const to = Math.min(src.length, m.index + m[0].length + 56);
    const local = lowered.slice(from, to);
    const score = scoreDeadlineMatch(src, m.index || 0, String(m[0]).length);
    pushDeadlineCandidate(candidates, { now, date: dt, score, localContext: local });
    if (!m[3]) {
      const dt2 = new Date(now.getFullYear() + 1, Number(mon), day, hour, minute, 0, 0);
      pushDeadlineCandidate(candidates, { now, date: dt2, score, localContext: local });
    }
  }
}

function extractDeadline(text, referenceDate = null) {
  const src = normalizeText(text);
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const now = Number.isNaN(ref.getTime()) ? new Date() : ref;
  if (!hasDeadlineIntent(src)) {
    return null;
  }
  const keywordWindows = extractKeywordWindows(src);
  const candidateTexts = keywordWindows.length > 0 ? keywordWindows : [src.slice(0, 500)];

  const candidates = [];
  for (const segment of candidateTexts) {
    collectDeadlineCandidatesFromSegment(segment, now, candidates);
  }

  if (candidates.length) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.date.getTime() - a.date.getTime();
    });
    return candidates[0].date;
  }

  const explicitDatePresent = hasExplicitDateMention(src);
  // Relative fallback only when explicit date text was not present.
  if (!explicitDatePresent && /\b(due|deadline|last date|submission|register by|closes on)\b/i.test(src)) {
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
  return null;
}

function sanitizeDeadlineTopic(text) {
  return String(text || "")
    .replace(/^\s*(re:|fwd:)\s*/ig, "")
    .replace(/^\s*(assignment|exam|test|project|lab|registration|deadline)\s*:\s*/ig, "")
    .replace(/^\s*(new assignment|assignment posted|new material|announcement|reminder)\s*:\s*/ig, "")
    .replace(/^\s*(from|starting from|starts from)\b[\s\S]*?\b(till|until|to)\b\s*/ig, "")
    .replace(/\b(due|deadline|submission|submit by|register by|closes on|last date|last day|extended till|extended until)\b[\s\S]*$/ig, "")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function detectActionLabel(text, providerCode = "") {
  const src = String(text || "").toLowerCase();
  if (/\b(exam\s*registration|registration\s*for\s*exam|register\s*for\s*exam)\b/.test(src)) return "Exam Registration";
  if (/\b(register|registration|enroll|enrol)\b/.test(src)) return providerCode === "hackathon" ? "Hackathon Registration" : "Registration";
  if (/\b(assignment|submission|submit|due|deadline)\b/.test(src)) return "Assignment";
  if (/\b(quiz|test|ft-i|ft-ii|internal|midsem|mid sem|endsem|end sem)\b/.test(src)) return "Test";
  if (/\b(exam)\b/.test(src)) return "Exam";
  if (/\b(project)\b/.test(src)) return "Project";
  if (/\b(lab|practical)\b/.test(src)) return "Lab";
  if (providerCode === "hackathon") return "Hackathon";
  return "Deadline";
}

function providerLabelForTitle(providerCode) {
  const code = String(providerCode || "").toLowerCase().trim();
  if (code === "classroom") return "Classroom";
  if (code === "nptel") return "NPTEL";
  if (code === "college") return "College";
  if (code === "coursera") return "Coursera";
  if (code === "udemy") return "Udemy";
  if (code === "hackathon") return "Hackathon";
  return "";
}

function extractCourseCode(text) {
  const src = String(text || "").toUpperCase();
  const m = src.match(/\b\d{2}[A-Z]{2,5}\d{3}[A-Z]?\b/);
  return m ? m[0] : "";
}

function isGenericAcademicSource(value) {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return true;
  return (
    text === "google classroom"
    || text === "classroom"
    || text === "nptel"
    || text === "coursera"
    || text === "udemy"
    || text === "college"
    || text === "academia"
  );
}

function normalizeAssessmentLabel(value) {
  const text = normalizeText(value).replace(/[!"'`]+/g, "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();

  const nptelWeekAssign = lower.match(/\bweek\s*([0-9]{1,2})\b[\s\S]*?\bassignment\b/i);
  if (nptelWeekAssign) {
    return `Week ${nptelWeekAssign[1]} Assignment`;
  }

  const assignNum = lower.match(/\bassignment\s*[-#: ]*\s*([0-9]+|[ivx]+)\b/i);
  if (assignNum) {
    const token = String(assignNum[1] || "").toUpperCase();
    return `Assignment ${token}`;
  }

  const ft = lower.match(/\bft\s*[- ]*\s*([ivx]+|\d+)\b/i);
  if (ft) {
    return `FT-${String(ft[1] || "").toUpperCase()}`;
  }

  const quizNum = lower.match(/\bquiz\s*[-#: ]*\s*(\d+)\b/i);
  if (quizNum) return `Quiz ${quizNum[1]}`;
  if (/\bquiz\b/i.test(lower)) return "Quiz";

  if (/\bexam registration\b/i.test(lower)) return "Exam Registration";
  if (/\bmid\s*sem\b/i.test(lower)) return "Mid Sem";
  if (/\bend\s*sem\b/i.test(lower)) return "End Sem";
  if (/\binternal\b/i.test(lower)) return "Internal";
  if (/\bexam\b/i.test(lower)) return "Exam";
  if (/\bassignment\b/i.test(lower)) return "Assignment";
  if (/\btest\b/i.test(lower)) return "Test";
  if (/\bproject\b/i.test(lower)) return "Project";
  if (/\blab\b/i.test(lower)) return "Lab";

  return text.slice(0, 60);
}

function extractQuotedTopic(text) {
  const src = String(text || "");
  const m = src.match(/["']([^"']{3,80})["']/);
  if (!m) return "";
  const clean = normalizeText(m[1]).replace(/[^a-z0-9 +\-]/gi, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.slice(0, 60);
}

function extractAssessmentLabel(text) {
  const direct = normalizeAssessmentLabel(text);
  if (direct) return direct;
  const quoted = extractQuotedTopic(text);
  return normalizeAssessmentLabel(quoted);
}

function cleanCourseName(value) {
  const cleaned = normalizeText(value)
    .replace(/\bweek\s*\d+\s*content\s*&?\s*assignment(?:\s*is\s*live\s*now)?!?/ig, " ")
    .replace(/\b(content|announcement|is live now|live now|posted|new assignment|due tomorrow)\b/ig, " ")
    .replace(/\bassignment\b/ig, " ")
    .replace(/[!]{2,}/g, " ")
    .replace(/\s*-\s*[!]+/g, " ")
    .replace(/\s*[!]+\s*-\s*/g, " ")
    .replace(/\s*-\s*-\s*/g, " ")
    .replace(/\s*[:\-]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[a-z0-9]/i.test(cleaned)) return "";
  return cleaned.slice(0, 120);
}

function extractCourseNameHint(text) {
  const src = String(text || "");
  const line = normalizeText(src).replace(/^(assignment|exam|test|project|lab|registration|deadline)\s*:\s*/i, "");
  if (!line) return "";

  const labeled = line.match(/\b(course|subject)\s*[:\-]\s*([a-z0-9][a-z0-9 &:(),.\-]{4,120})/i);
  if (labeled) return cleanCourseName(labeled[2]);

  const prefixBeforeAssessment = line.match(/^(.{4,120}?)\s*[:\-]\s*(?:content\s*&\s*)?(assignment|quiz|test|exam|submission|deadline)\b/i);
  if (prefixBeforeAssessment) return cleanCourseName(prefixBeforeAssessment[1]);

  const forPattern = line.match(/\bfor\s+([a-z0-9][a-z0-9 &:(),.\-]{4,120})\b/i);
  if (forPattern) return cleanCourseName(forPattern[1]);

  return "";
}

function buildAcademicDeadlineTitle({ subject = "", snippet = "", bodyText = "", source = null } = {}) {
  const sourceName = source && source.sourceName ? String(source.sourceName) : "";
  const providerCode = source && source.providerCode ? String(source.providerCode) : "";
  const corpus = normalizeText(`${subject}\n${snippet}\n${bodyText}`);
  const action = detectActionLabel(corpus, providerCode);
  const code = extractCourseCode(corpus);
  const assessment = extractAssessmentLabel(corpus);
  const courseHints = [
    extractCourseNameHint(subject),
    extractCourseNameHint(sourceName),
    extractCourseNameHint(snippet),
    extractCourseNameHint(bodyText)
  ].filter(Boolean);
  const courseName = courseHints.find((value) => !isGenericAcademicSource(value)) || "";
  const topicCandidates = [
    sanitizeDeadlineTopic(subject),
    sanitizeDeadlineTopic(snippet),
    sanitizeDeadlineTopic(bodyText),
    isGenericAcademicSource(sourceName) ? "" : sanitizeDeadlineTopic(sourceName)
  ].filter((value) => Boolean(value) && !isGenericAcademicSource(value));
  const topic = topicCandidates.find((value) => value && value.length >= 4) || "";
  const coreSubject = code || courseName || topic || "";

  const details = [];
  if (coreSubject && coreSubject.toLowerCase() !== action.toLowerCase()) {
    details.push(coreSubject);
  }
  if (
    assessment
    && assessment.toLowerCase() !== action.toLowerCase()
    && (!coreSubject || assessment.toLowerCase() !== coreSubject.toLowerCase())
  ) {
    details.push(assessment);
  }

  let preferred = action;
  if (details.length > 0) {
    preferred = `${action}: ${details.join(" - ")}`;
  }

  const providerLabel = providerLabelForTitle(providerCode);
  if (providerLabel && preferred && !new RegExp(`\\b${providerLabel}\\b`, "i").test(preferred)) {
    preferred = `${providerLabel} ${preferred}`;
  }

  return cleanSourceName(preferred || subject || sourceName || "Academic Deadline");
}

function analyzeAcademicEmail({ subject = "", snippet = "", bodyText = "", from = "", referenceDate = null } = {}) {
  const content = normalizeText(`${subject}\n${snippet}\n${bodyText}`);
  const senderAcademic = isAcademicSender(from);
  const hasAction = containsAny(content, ACADEMIC_ACTION_KEYWORDS);
  const hasPlatform = containsAny(content, ACADEMIC_PLATFORM_KEYWORDS);
  const hasPromo = containsAny(content, NEGATIVE_PROMO_KEYWORDS);

  const relevant = (
    hasAction
    && (senderAcademic || hasPlatform)
    && !hasPromo
  );

  const parsedDeadline = relevant ? extractDeadline(content, referenceDate) : null;
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
  buildAcademicDeadlineTitle,
  extractGmailMessageText,
  deriveAcademicSource,
  __debug: {
    scoreDeadlineContext,
    scoreDeadlineMatch,
    buildAcademicDeadlineTitle
  }
};

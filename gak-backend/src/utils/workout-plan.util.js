function cleanLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value) {
  const raw = cleanLine(value);
  if (!raw) return "";
  if (raw === raw.toUpperCase()) {
    return raw.toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
  }
  return raw;
}

function normalizeDayLabel(value) {
  return toTitleCase(String(value || "")
    .replace(/^[\s\-–:|]+/, "")
    .replace(/[\s\-–:|]+$/, ""))
    .slice(0, 80);
}

function cleanExerciseName(value) {
  return cleanLine(String(value || "")
    .replace(/^[\u2022•*\-–]+\s*/, "")
    .replace(/^\d+\s*[\).:-]\s*/, "")
    .replace(/\s*[-–:|]+\s*$/, ""))
    .slice(0, 255);
}

const SPLIT_LABEL_RE = /(push|pull|legs?|upper(?:\s+body)?|lower(?:\s+body)?|chest|back|shoulders?|arms?|core|full\s*body|conditioning|cardio|hiit)/i;

function normalizeReps(value) {
  return cleanLine(value)
    .replace(/–/g, "-")
    .replace(/\bto\b/ig, "-")
    .replace(/\s+/g, "");
}

function extractSectionLabel(line) {
  const raw = cleanLine(String(line || "")
    .replace(/^[\u2022•*\-–#>]+\s*/, "")
    .replace(/^\d+\s*[\).:-]\s*/, ""));
  if (!raw) return null;
  const normalized = cleanLine(raw.replace(/\([^)]*\)/g, ""));

  if (normalized.length > 96) return null;
  if (/\b(kcal|calorie|burn|bodyweight|hydration|guide|summary|average)\b/i.test(normalized)) return null;
  if (/\b(rotation structure|repeat cycle|then repeat)\b/i.test(normalized)) return null;
  if (/\d{1,2}\s*[x×]\s*\d{1,3}/i.test(normalized)) return null;
  if (/\bsets?\b|\breps?\b/i.test(normalized) && /\d/.test(normalized)) return null;
  if (/\b(pre|post)[\s-]*workout(?:\s+meal)?\b/i.test(normalized)) return null;
  if (/^[\d\s]+$/.test(normalized)) return null;

  const dayWithSplit = normalized.match(
    /^(day\s*[1-7])\s*(?:[-–:|]\s*|\s+)(push|pull|legs?|upper(?:\s+body)?|lower(?:\s+body)?|chest|back|shoulders?|arms?|core|full\s*body|conditioning|cardio|hiit)\s*(?:day|workout|session)?$/i
  );
  if (dayWithSplit) {
    return normalizeDayLabel(`${dayWithSplit[1]} - ${dayWithSplit[2]}`);
  }

  const dayOnly = normalized.match(/^(day\s*[1-7])$/i);
  if (dayOnly) return normalizeDayLabel(dayOnly[1]);

  const doWithSplit = normalized.match(
    /^(do\s*([1-9]\d?))\s*(?:[-–:|]\s*|\s+)(.*)$/i
  );
  if (doWithSplit) {
    const doLabel = `DO${doWithSplit[2]}`;
    const rest = cleanLine(String(doWithSplit[3] || "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(morning|evening|session|workout)\b/ig, "")
      .replace(/\s+/g, " "));
    const split = rest.match(SPLIT_LABEL_RE);
    if (split) return normalizeDayLabel(`${doLabel} - ${split[0]}`);
    return normalizeDayLabel(doLabel);
  }

  const weekdayWithSplit = normalized.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:[-–:|]\s*(.*))?$/i
  );
  if (weekdayWithSplit) {
    const day = normalizeDayLabel(weekdayWithSplit[1]);
    const rest = cleanLine(String(weekdayWithSplit[2] || "").replace(/\([^)]*\)/g, ""));
    const split = rest.match(SPLIT_LABEL_RE);
    if (split) return normalizeDayLabel(`${day} - ${split[0]}`);
    return day;
  }

  if (/\d{1,2}:\d{2}\s*(am|pm)?/i.test(normalized)) return null;

  const splitOnly = normalized.match(
    /^(push|pull|legs?|upper(?:\s+body)?|lower(?:\s+body)?|chest|back|shoulders?|arms?|core|full\s*body|conditioning|cardio|hiit)(?:\s*(?:day|workout|session))?$/i
  );
  if (splitOnly) return normalizeDayLabel(splitOnly[1]);

  return null;
}

function splitInlineSection(nameRaw) {
  const name = cleanExerciseName(nameRaw);
  if (!name) return { dayLabel: null, exerciseName: null };
  const inline = name.match(
    /^((?:day\s*[1-7](?:\s*[-–:|]\s*(?:push|pull|legs?|upper(?:\s+body)?|lower(?:\s+body)?|chest|back|shoulders?|arms?|core|full\s*body|conditioning|cardio|hiit))?)|(?:push|pull|legs?|upper(?:\s+body)?|lower(?:\s+body)?|chest|back|shoulders?|arms?|core|full\s*body|conditioning|cardio|hiit)(?:\s*(?:day|workout|session))?)\s+[-–:|]\s+(.+)$/i
  );
  if (!inline) {
    return { dayLabel: null, exerciseName: name };
  }
  return {
    dayLabel: normalizeDayLabel(inline[1]),
    exerciseName: cleanExerciseName(inline[2])
  };
}

function parseTimeTo24h(hh, mm, ampm) {
  let h = Number(hh);
  const m = Number(mm);
  const a = String(ampm || "").toUpperCase();
  if (a === "PM" && h < 12) h += 12;
  if (a === "AM" && h === 12) h = 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function parseSingleTimeTo24h(text) {
  const value = String(text || "");
  const withMeridian = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (withMeridian) {
    return parseTimeTo24h(withMeridian[1], withMeridian[2], withMeridian[3]);
  }
  const plain = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!plain) return null;
  return `${String(Number(plain[1])).padStart(2, "0")}:${String(Number(plain[2])).padStart(2, "0")}:00`;
}

function extractSchedule(text) {
  const value = String(text || "");
  const match =
    value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    || null;
  if (!match) return { startTime: null, endTime: null };

  const startTime = parseTimeTo24h(match[1], match[2], match[3] || match[6]);
  const endTime = parseTimeTo24h(match[4], match[5], match[6] || match[3]);
  return { startTime, endTime };
}

function extractEstimatedCalories(lines) {
  let best = null;
  for (const raw of lines || []) {
    const line = cleanLine(raw);
    if (!line || !/\b(calorie|kcal|burn)\b/i.test(line)) continue;
    if (/\b(bodyweight|weight)\b/i.test(line) && !/\bkcal\b/i.test(line)) continue;
    const rangeMatch = line.match(/\b(\d{2,4})\s*(?:-|–|to)\s*(\d{2,4})\s*(kcal|calories?)\b/i);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        const min = Math.min(lo, hi);
        const max = Math.max(lo, hi);
        if (min >= 50 && max <= 2500) {
          const mid = Math.round((min + max) / 2);
          const score = 20 + (/\b(estimated|session|workout|do\d+|day)\b/i.test(line) ? 6 : 0);
          if (!best || score > best.score) {
            best = { value: mid, score };
          }
        }
      }
    }
    const hasBurnCue = /\b(burn|burnt|burned|target|session|workout|exercise)\b/i.test(line);
    const matches = [...line.matchAll(/\b(\d{2,4}(?:\.\d+)?)\b/g)];
    for (const match of matches) {
      const token = match[1];
      const value = Number(token);
      if (!Number.isFinite(value) || value < 50 || value > 2500) continue;
      const start = Math.max(0, (match.index || 0) - 16);
      const end = Math.min(line.length, (match.index || 0) + token.length + 16);
      const around = line.slice(start, end).toLowerCase();
      if (/\bkg\b|\bbodyweight\b|\bweight\b/.test(around)) continue;
      const score = (hasBurnCue ? 10 : 0) + (/\bkcal\b/i.test(line) ? 4 : 0) + (/\b~/.test(around) ? 1 : 0);
      if (!best || score > best.score) {
        best = { value: Math.round(value), score };
      }
    }
  }
  return best ? best.value : null;
}

function cleanMealText(value) {
  return cleanLine(String(value || "")
    .replace(/\b(pre|post)[-\s]*workout(?:\s+meal)?\b/ig, "")
    .replace(/^[\s:;,\-–]+/, "")
    .replace(/\b(at|around)\s*\d{1,2}:\d{2}\s*(am|pm)?\b/ig, "")
    .replace(/\s+/g, " "))
    .slice(0, 255);
}

function extractMealTiming(lines, kind) {
  const label = kind === "pre" ? /pre[\s-]*workout(?:\s+meal)?/i : /post[\s-]*workout(?:\s+meal)?/i;
  for (const raw of lines || []) {
    const line = cleanLine(raw);
    if (!label.test(line)) continue;
    const time = parseSingleTimeTo24h(line);
    const meal = cleanMealText(line);
    return {
      time,
      meal: meal || null
    };
  }
  return { time: null, meal: null };
}

function extractExercisesFromLines(lines) {
  const exercises = [];
  let order = 0;
  let activeSection = null;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const section = extractSectionLabel(line);
    if (section) {
      activeSection = section;
      continue;
    }

    const m =
      line.match(/^(.+?)\s+(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?)\b/i)
      || line.match(/^(.+?)\s+\(?(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?)\)?$/i);

    if (m) {
      const split = splitInlineSection(m[1]);
      const name = split.exerciseName;
      const sets = Number(m[2]);
      const reps = normalizeReps(m[3]);
      if (name) {
        exercises.push({
          exerciseName: name,
          dayLabel: split.dayLabel || activeSection || null,
          sets: Number.isFinite(sets) ? sets : null,
          reps,
          sortOrder: order++
        });
      }
      continue;
    }

    // Alternate format: "Bench Press - 4 sets 8-10 reps"
    const alt = line.match(
      /^(.+?)(?:\s*[-–:]\s*|\s+)(\d{1,2})\s*sets?\s*(?:x|of)?\s*(\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?)\s*reps?/i
    );
    if (alt) {
      const split = splitInlineSection(alt[1]);
      const name = split.exerciseName;
      const sets = Number(alt[2]);
      const reps = normalizeReps(alt[3]);
      if (name) {
        exercises.push({
          exerciseName: name,
          dayLabel: split.dayLabel || activeSection || null,
          sets: Number.isFinite(sets) ? sets : null,
          reps,
          sortOrder: order++
        });
      }
      continue;
    }

    // Alternate format: "Bench Press 4 sets 10 reps"
    const wordsAlt = line.match(/^(.+?)\s+(\d{1,2})\s*sets?\s+(\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?)\s*reps?\b/i);
    if (wordsAlt) {
      const split = splitInlineSection(wordsAlt[1]);
      const name = split.exerciseName;
      const sets = Number(wordsAlt[2]);
      const reps = normalizeReps(wordsAlt[3]);
      if (name) {
        exercises.push({
          exerciseName: name,
          dayLabel: split.dayLabel || activeSection || null,
          sets: Number.isFinite(sets) ? sets : null,
          reps,
          sortOrder: order++
        });
      }
      continue;
    }

    // Alternate format: "Pull-ups - 4 sets"
    const setsOnly = line.match(/^(.+?)\s*[-–:|]?\s*(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*sets?\b/i);
    if (setsOnly) {
      const split = splitInlineSection(setsOnly[1]);
      const name = split.exerciseName;
      const a = Number(setsOnly[2]);
      const b = setsOnly[3] === undefined ? Number.NaN : Number(setsOnly[3]);
      const sets = Number.isFinite(b) ? Math.max(a, b) : a;
      if (name && Number.isFinite(sets)) {
        exercises.push({
          exerciseName: name,
          dayLabel: split.dayLabel || activeSection || null,
          sets,
          reps: null,
          sortOrder: order++
        });
      }
    }
  }

  return exercises;
}

function pickPlanName(lines, fallback) {
  const scored = (lines || [])
    .map(cleanLine)
    .filter(Boolean)
    .filter((l) => l.length >= 4 && l.length <= 90)
    .filter((l) => /[A-Za-z]/.test(l))
    .map((line) => {
      const lower = line.toLowerCase();
      let score = 0;
      if (/\b(plan|gym|workout|rotation|split|system|program)\b/.test(lower)) score += 8;
      if (/\b(final|based|do-based|day order)\b/.test(lower)) score += 3;
      if (/\b(push|pull|legs|strength|conditioning)\b/.test(lower)) score += 2;
      if (/\b(page \d+|upload|options|hydration|average calories|estimated|pre-workout guide)\b/.test(lower)) score -= 8;
      if (SPLIT_LABEL_RE.test(lower) && !/\b(day|plan|program|split|rotation|workout)\b/.test(lower)) score -= 3;
      if (line.length > 72) score -= 2;
      if (line.length >= 12 && line.length <= 58) score += 2;
      return { line, score };
    })
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length);

  const preferred = scored.find((item) => item.score > 0)?.line || "";
  if (preferred) {
    return preferred.replace(/\s+/g, " ").trim().slice(0, 90);
  }
  const safeFallback = cleanLine(fallback || "");
  return safeFallback || "Workout Plan";
}

async function parseWorkoutPlanPdf({ pdfParse, buffer, fileName }) {
  let text = "";
  if (typeof pdfParse === "function") {
    const parsed = await pdfParse(buffer);
    text = String(parsed?.text || "");
  } else if (pdfParse && typeof pdfParse.PDFParse === "function") {
    const parser = new pdfParse.PDFParse({ data: buffer });
    const parsed = await parser.getText();
    text = String(parsed?.text || "");
    if (typeof parser.destroy === "function") {
      await parser.destroy();
    }
  } else {
    throw new Error("Unsupported pdf-parse module format");
  }

  const rawLines = text
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter(Boolean);

  const { startTime, endTime } = extractSchedule(text);
  const planName = pickPlanName(rawLines, fileName ? String(fileName).replace(/\.[^.]+$/, "") : null);
  const estimatedCaloriesBurned = extractEstimatedCalories(rawLines);
  const preWorkoutMeal = extractMealTiming(rawLines, "pre");
  const postWorkoutMeal = extractMealTiming(rawLines, "post");

  // Prefer matching "sets x reps" patterns.
  const exercises = extractExercisesFromLines(rawLines);

  return {
    planName,
    startTime,
    endTime,
    estimatedCaloriesBurned,
    preWorkoutMealTime: preWorkoutMeal.time,
    preWorkoutMealText: preWorkoutMeal.meal,
    postWorkoutMealTime: postWorkoutMeal.time,
    postWorkoutMealText: postWorkoutMeal.meal,
    exercises
  };
}

module.exports = {
  parseWorkoutPlanPdf
};

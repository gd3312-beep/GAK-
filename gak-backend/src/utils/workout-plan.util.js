function cleanLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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

function extractExercisesFromLines(lines) {
  const exercises = [];
  let order = 0;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const m =
      line.match(/^(.+?)\s+(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*-\s*\d{1,3})?)\b/i)
      || line.match(/^(.+?)\s+\(?(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*-\s*\d{1,3})?)\)?$/i);

    if (m) {
      const name = cleanLine(m[1]);
      const sets = Number(m[2]);
      const reps = cleanLine(m[3]).replace(/\s+/g, "");
      if (name) {
        exercises.push({ exerciseName: name, sets: Number.isFinite(sets) ? sets : null, reps, sortOrder: order++ });
      }
      continue;
    }

    // Alternate format: "Bench Press - 4 sets 8-10 reps"
    const alt = line.match(/^(.+?)[-–]\s*(\d{1,2})\s*sets?\s*(\d{1,3}(?:\s*-\s*\d{1,3})?)\s*reps?/i);
    if (alt) {
      const name = cleanLine(alt[1]);
      const sets = Number(alt[2]);
      const reps = cleanLine(alt[3]).replace(/\s+/g, "");
      if (name) {
        exercises.push({ exerciseName: name, sets: Number.isFinite(sets) ? sets : null, reps, sortOrder: order++ });
      }
    }
  }

  return exercises;
}

function pickPlanName(lines, fallback) {
  const candidates = lines
    .map(cleanLine)
    .filter(Boolean)
    .filter((l) => l.length >= 4 && l.length <= 48)
    .filter((l) => /[A-Za-z]/.test(l))
    .filter((l) => !/workout plan|upload|page \d+/i.test(l));

  return candidates[0] || fallback || "Workout Plan";
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

  // Prefer matching "sets x reps" patterns.
  const exercises = extractExercisesFromLines(rawLines);

  return {
    planName,
    startTime,
    endTime,
    exercises
  };
}

module.exports = {
  parseWorkoutPlanPdf
};

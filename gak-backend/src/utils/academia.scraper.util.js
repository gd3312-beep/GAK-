const { randomUUID, createHash } = require("crypto");
const path = require("path");
const fs = require("fs");
let playwright = null;
try {
  // Optional dependency: only required when scraping hash-based SPA pages.
  // Installed via `npm i playwright`.
  playwright = require("playwright");
} catch (_error) {
  playwright = null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryScrape(error) {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("timeout")
    || text.includes("navigation")
    || text.includes("net::")
    || text.includes("econn")
    || text.includes("503")
    || text.includes("502")
    || text.includes("temporar")
  );
}

function isFatalScrapeError(error) {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("invalid college credentials")
    || text.includes("check college email/password")
    || text.includes("mfa")
    || text.includes("otp")
  );
}

async function withRetry(task, { attempts, backoffMs }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetryScrape(error)) {
        throw error;
      }
      await sleep(backoffMs * attempt);
    }
  }

  throw lastError;
}

function cleanText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRowsFromHtmlTables(html) {
  const tables = [...String(html || "").matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const allRows = [];

  for (const table of tables) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
    for (const row of rows) {
      const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cleanText(m[1])).filter(Boolean);
      if (cells.length) {
        allRows.push(cells);
      }
    }
  }

  return allRows;
}

function normalizeCourseCode(value) {
  const raw = String(value || "").toUpperCase().trim();
  if (!raw) return "";
  return raw.replace(/\bREGULAR\b/g, "").replace(/\s+/g, " ").trim();
}

function isCourseCodeLike(value) {
  const normalized = normalizeCourseCode(value);
  return /^[0-9]{2}[A-Z]{2,}\d+[A-Z]?$/.test(normalized);
}

function buildCourseTitleMap(rows) {
  const map = new Map();
  const lower = (value) => String(value || "").trim().toLowerCase();

  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i] || [];
    const headerCols = cells.map(lower);
    if (!headerCols.includes("course code") || !headerCols.some((c) => c.includes("course title"))) {
      continue;
    }
    const idxCode = headerCols.indexOf("course code");
    const idxTitle = headerCols.findIndex((c) => c.includes("course title"));
    for (const row of rows.slice(i + 1)) {
      if (!Array.isArray(row) || row.length <= Math.max(idxCode, idxTitle)) continue;
      const code = normalizeCourseCode(row[idxCode]);
      const title = cleanText(row[idxTitle] || "").slice(0, 255);
      if (!code || !title || !isCourseCodeLike(code)) continue;
      if (!map.has(code)) map.set(code, title);
    }
  }
  return map;
}

function parseDayOrder(value) {
  const text = String(value || "").toLowerCase();
  const dayOrderMatch = text.match(/day\s*[- ]?order\s*(\d+)/i) || text.match(/\bday\s*(\d+)\b/i);
  if (dayOrderMatch) {
    const day = Number(dayOrderMatch[1]);
    if (Number.isFinite(day) && day >= 1 && day <= 7) return day;
  }

  if (/monday|mon\b/.test(text)) return 1;
  if (/tuesday|tue\b/.test(text)) return 2;
  if (/wednesday|wed\b/.test(text)) return 3;
  if (/thursday|thu\b/.test(text)) return 4;
  if (/friday|fri\b/.test(text)) return 5;
  if (/saturday|sat\b/.test(text)) return 6;
  if (/sunday|sun\b/.test(text)) return 7;
  return null;
}

function normalizeTime(text) {
  if (!text) return null;
  const match = String(text).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = String(match[1]).padStart(2, "0");
  const mm = match[2];
  return `${hh}:${mm}:00`;
}

function parseTimeRange(text) {
  const value = String(text || "");
  const match = value.match(/(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/i);
  if (!match) {
    return { startTime: null, endTime: null };
  }

  return {
    startTime: normalizeTime(match[1]),
    endTime: normalizeTime(match[2])
  };
}

function normalizeSlotToken(value) {
  const raw = String(value || "").toUpperCase().trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  const match = compact.match(/\b([A-Z]\d?)\b/);
  return match ? match[1] : compact.slice(0, 8);
}

const DEFAULT_SLOT_TIMINGS = {
  A: { startTime: "08:00:00", endTime: "08:50:00" },
  B: { startTime: "09:00:00", endTime: "09:50:00" },
  C: { startTime: "10:00:00", endTime: "10:50:00" },
  D: { startTime: "11:00:00", endTime: "11:50:00" },
  E: { startTime: "12:00:00", endTime: "12:50:00" },
  F: { startTime: "14:00:00", endTime: "14:50:00" },
  G: { startTime: "15:00:00", endTime: "15:50:00" },
  H: { startTime: "16:00:00", endTime: "16:50:00" },
  LAB: { startTime: "14:00:00", endTime: "15:40:00" }
};

function parseSlotTimeHints(text) {
  const lines = String(text || "").split(/\r?\n/);
  const hints = new Map();
  for (const line of lines) {
    const clean = String(line || "").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const m = clean.match(/\b([A-Z]\d?|LAB)\b[^\d]{0,20}(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/i);
    if (!m) continue;
    const slot = normalizeSlotToken(m[1]);
    if (!slot) continue;
    const startTime = normalizeTime(m[2]);
    const endTime = normalizeTime(m[3]);
    if (startTime && endTime && !hints.has(slot)) {
      hints.set(slot, { startTime, endTime });
    }
  }
  return hints;
}

function inferDayOrderFromSlot(slotToken) {
  const value = String(slotToken || "").toUpperCase();
  const m = value.match(/^([A-Z])/);
  if (!m) return null;
  const code = m[1].charCodeAt(0) - 64;
  return code >= 1 && code <= 7 ? code : null;
}

function parseTimetableRows(html) {
  const rows = parseRowsFromHtmlTables(html);
  const parsed = [];

  for (const cells of rows) {
    const joined = cells.join(" ");
    const hasTime = /(\d{1,2}:\d{2})/.test(joined);
    if (!hasTime || cells.length < 3) {
      continue;
    }

    const dayLabel = cells.find((c) => /day|mon|tue|wed|thu|fri/i.test(c)) || null;
    const dayOrder = parseDayOrder(dayLabel || "");
    const rangeCell = cells.find((c) => /(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/i.test(c)) || "";
    const { startTime, endTime } = parseTimeRange(rangeCell);

    const remaining = cells.filter((c) => c !== dayLabel && c !== rangeCell);
    const subjectName = remaining[0] || "";
    if (!subjectName) {
      continue;
    }

    parsed.push({
      id: randomUUID(),
      dayOrder,
      dayLabel: dayLabel || null,
      startTime,
      endTime,
      subjectName,
      facultyName: remaining[1] || null,
      roomLabel: remaining[2] || null
    });
  }

  if (parsed.length) {
    return parsed;
  }

  // Fallback: SRM "My Time Table" is often a course list with Slot/Room/Faculty,
  // not a day/time schedule. Cache it by storing slot in `dayLabel`.
  const lower = (value) => String(value || "").trim().toLowerCase();
  const headerRow = rows.find((cells) => {
    const cols = cells.map(lower);
    return cols.includes("course code") && cols.some((c) => c.includes("course title")) && cols.includes("slot");
  });
  if (!headerRow) {
    return [];
  }

  const headerCols = headerRow.map(lower);
  const idxCourseCode = headerCols.indexOf("course code");
  const idxCourseTitle = headerCols.findIndex((c) => c.includes("course title"));
  const idxFaculty = headerCols.findIndex((c) => c.includes("faculty"));
  const idxSlot = headerCols.indexOf("slot");
  const idxRoom = headerCols.findIndex((c) => c.includes("room"));

  const slotTimeHints = parseSlotTimeHints(htmlToTextLines(html).join("\n"));
  const headerAt = rows.indexOf(headerRow);
  for (const cells of rows.slice(headerAt + 1)) {
    if (cells.length <= Math.max(idxCourseCode, idxCourseTitle, idxSlot)) {
      continue;
    }

    const courseCode = String(cells[idxCourseCode] || "").trim();
    const courseTitle = String(cells[idxCourseTitle] || "").trim();
    const slot = String(cells[idxSlot] || "").trim();
    if (!courseCode || !courseTitle || !slot) {
      continue;
    }

    const slotToken = normalizeSlotToken(slot);
    const inferred = (slotToken && slotTimeHints.get(slotToken)) || (slotToken && DEFAULT_SLOT_TIMINGS[slotToken]) || null;

    parsed.push({
      id: randomUUID(),
      dayOrder: parseDayOrder(slot) || null,
      dayLabel: slotToken || slot,
      startTime: inferred ? inferred.startTime : null,
      endTime: inferred ? inferred.endTime : null,
      subjectName: courseTitle,
      facultyName: idxFaculty >= 0 ? cells[idxFaculty] || null : null,
      roomLabel: idxRoom >= 0 ? cells[idxRoom] || null : null,
      // extra fields (ignored by DB insert but useful for callers)
      courseCode,
      slot
    });
  }

  return parsed;
}

function parseTimetableRowsFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed = [];
  const slotTimeHints = parseSlotTimeHints(text);
  for (const line of lines) {
    // Common list-like pattern: "<code> <title> <slot> <faculty> ..."
    let cols = splitColumnsFromLine(line);
    if (cols.length < 3) {
      const m = line.match(/^([A-Z0-9]{5,})\s+(.+?)\s+([A-Z]\d?|LAB)\s+(.+?)(?:\s+([A-Z]{1,4}[- ]?\d{2,4}|LAB[- ]?\d+))?$/i);
      if (m) {
        cols = [m[1], m[2], m[3], m[4], m[5] || ""].filter(Boolean);
      }
    }
    if (cols.length < 3) continue;
    const slotLike = cols.find((c) => /\b([A-Z]\d?|LAB|slot)\b/i.test(c));
    if (!slotLike) continue;

    const subjectName = cleanText(cols[1] || cols[0] || "");
    if (!subjectName || /course code|course title|faculty/i.test(subjectName)) continue;

    const slotToken = normalizeSlotToken(slotLike);
    const explicitDayOrder = parseDayOrder(line) || parseDayOrder(slotLike) || null;
    const inferred = (slotToken && slotTimeHints.get(slotToken)) || (slotToken && DEFAULT_SLOT_TIMINGS[slotToken]) || null;

    parsed.push({
      id: randomUUID(),
      dayOrder: explicitDayOrder,
      dayLabel: String(slotToken || slotLike).slice(0, 50),
      startTime: inferred ? inferred.startTime : null,
      endTime: inferred ? inferred.endTime : null,
      subjectName: subjectName.slice(0, 255),
      facultyName: cols[3] ? cleanText(cols[3]).slice(0, 255) : null,
      roomLabel: cols[4] ? cleanText(cols[4]).slice(0, 255) : null
    });
  }

  return parsed;
}

function parseMarksRows(html) {
  const rows = parseRowsFromHtmlTables(html);
  const courseTitleByCode = buildCourseTitleMap(rows);
  const lower = (value) => String(value || "").trim().toLowerCase();
  const headerRow = rows.find((cells) => {
    const cols = cells.map(lower);
    return cols.includes("course code") && cols.some((c) => c.includes("test performance"));
  });
  if (headerRow) {
    const parsedTestPerf = [];
    const headerCols = headerRow.map(lower);
    const idxCourse = headerCols.indexOf("course code");
    const idxPerf = headerCols.findIndex((c) => c.includes("test performance"));
    const headerAt = rows.indexOf(headerRow);

    for (const cells of rows.slice(headerAt + 1)) {
      if (cells.length <= Math.max(idxCourse, idxPerf)) continue;
      const courseCode = normalizeCourseCode(cells[idxCourse] || "");
      const perf = String(cells[idxPerf] || "").trim();
      if (!courseCode || !perf) continue;

      const matches = [...perf.matchAll(/([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g)];
      for (const m of matches) {
        const componentName = String(m[1] || "").trim();
        const maxScore = Number(m[2]);
        const score = Number(m[3]);
        if (!componentName || !Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) continue;
        parsedTestPerf.push({
          id: randomUUID(),
          subjectName: courseTitleByCode.get(courseCode) || courseCode,
          componentName,
          score,
          maxScore,
          percentage: Number(((score / maxScore) * 100).toFixed(2))
        });
      }
    }

    if (parsedTestPerf.length > 0) {
      return parsedTestPerf;
    }
  }

  const parsed = [];
  let currentSubject = null;

  for (const cells of rows) {
    if (cells.length < 2) {
      continue;
    }

    const joined = cells.join(" ").trim();
    if (/course code|test performance|component|max|score|obtained/i.test(joined)) {
      continue;
    }
    if (!/\/|\d/.test(joined) && cells.length <= 2) {
      currentSubject = cleanText(joined).slice(0, 255);
      continue;
    }

    const scoreCell = cells.find((c) => /\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/.test(c));
    let score = null;
    let maxScore = null;
    let componentName = cells[1] || "overall";

    if (scoreCell) {
      const compactStyle = scoreCell.match(/([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
      if (compactStyle) {
        componentName = compactStyle[1] || componentName;
        maxScore = Number(compactStyle[2]);
        score = Number(compactStyle[3]);
      } else {
        const scoreMatch = scoreCell.match(/(\d+(\.\d+)?)\s*\/\s*(\d+(\.\d+)?)/);
        if (scoreMatch) {
          score = Number(scoreMatch[1]);
          maxScore = Number(scoreMatch[3]);
          if (score > maxScore) {
            const tmp = score;
            score = maxScore;
            maxScore = tmp;
          }
        }
      }
    } else {
      const numeric = cells
        .map((c) => Number(String(c).replace(/[^\d.]/g, "")))
        .filter((n) => Number.isFinite(n));
      if (numeric.length >= 2) {
        let maybeScore = numeric[numeric.length - 2];
        let maybeMax = numeric[numeric.length - 1];
        if (maybeScore > maybeMax) {
          const tmp = maybeScore;
          maybeScore = maybeMax;
          maybeMax = tmp;
        }
        if (maybeMax > 0 && maybeScore >= 0 && maybeScore <= maybeMax) {
          score = maybeScore;
          maxScore = maybeMax;
          componentName = cells.find((c) => /ft|quiz|internal|assign|lab|practical|mid|end|overall/i.test(c)) || componentName;
        }
      }
    }

    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
      continue;
    }

    const subjectRaw = cleanText(cells[0] || currentSubject || "Unknown Subject").slice(0, 255);
    const subjectCode = normalizeCourseCode(subjectRaw);
    const subjectName = isCourseCodeLike(subjectCode)
      ? (courseTitleByCode.get(subjectCode) || subjectRaw)
      : subjectRaw;
    currentSubject = subjectName || currentSubject;
    if (!subjectName) continue;

    parsed.push({
      id: randomUUID(),
      subjectName,
      componentName: cleanText(componentName || "overall").slice(0, 255),
      score,
      maxScore,
      percentage: Number(((score / maxScore) * 100).toFixed(2))
    });
  }

  if (parsed.length) {
    return parsed;
  }

  return parsed;
}

function parseMarksRowsFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed = [];
  const courseTitleByCode = new Map();
  let currentSubject = null;
  let pendingComponent = null;
  for (const line of lines) {
    if (/course code|test performance|max score|obtained|component/i.test(line)) {
      continue;
    }

    const codeTitleLine = line.match(/^([0-9]{2}[A-Z]{2,}\d+[A-Z]?)\s+(.{3,120})$/i);
    if (codeTitleLine && !/\d+\s*\/\s*\d+/.test(line)) {
      const code = normalizeCourseCode(codeTitleLine[1]);
      const title = cleanText(codeTitleLine[2]).slice(0, 255);
      if (code && title && !/ft|quiz|internal|assignment|lab|practical/i.test(title)) {
        courseTitleByCode.set(code, title);
      }
    }

    // Subject header style lines.
    if (
      /^[A-Z]{2,}\d{2,}/.test(line)
      || (/theory|lab|practical/i.test(line) && line.length < 120 && !/\d+\s*\/\s*\d+/.test(line))
    ) {
      const rawSubject = cleanText(line).slice(0, 255);
      const code = normalizeCourseCode(rawSubject);
      currentSubject = isCourseCodeLike(code) ? (courseTitleByCode.get(code) || rawSubject) : rawSubject;
      pendingComponent = null;
      continue;
    }

    // Example: FT-I/5.00 2.50
    const m = line.match(/([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    if (m) {
      const componentName = cleanText(m[1]).slice(0, 255);
      const maxScore = Number(m[2]);
      const score = Number(m[3]);
      if (!componentName || !Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) {
        continue;
      }
      parsed.push({
        id: randomUUID(),
        subjectName: (currentSubject || "Unknown Subject").slice(0, 255),
        componentName,
        score,
        maxScore,
        percentage: Number(((score / maxScore) * 100).toFixed(2))
      });
      pendingComponent = null;
      continue;
    }

    // Example: "FT-I 5.0/5.0" or "5.0/5.0" with previous component line.
    const ratioInline = line.match(/^([A-Za-z][A-Za-z0-9 -]{1,40})?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?:\s*%?)$/i);
    if (ratioInline) {
      const inlineComponent = cleanText(ratioInline[1] || pendingComponent || "overall").slice(0, 255);
      const score = Number(ratioInline[2]);
      const maxScore = Number(ratioInline[3]);
      if (Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0 && score >= 0) {
        parsed.push({
          id: randomUUID(),
          subjectName: (currentSubject || "Unknown Subject").slice(0, 255),
          componentName: inlineComponent,
          score,
          maxScore,
          percentage: Number(((score / maxScore) * 100).toFixed(2))
        });
        pendingComponent = null;
      }
      continue;
    }

    if (/^(ft|quiz|internal|assignment|assign|lab|practical|mid|end|cie|cat)[\w\s\-()]*$/i.test(line)) {
      pendingComponent = cleanText(line).slice(0, 255);
    }
  }

  return parsed;
}

function parseAttendanceRows(html) {
  const rows = parseRowsFromHtmlTables(html);
  const parsed = [];

  for (const cells of rows) {
    if (cells.length < 2) {
      continue;
    }

    const ratioCell = cells.find((c) => /\d+\s*\/\s*\d+/.test(c));
    const percentageCell = cells.find((c) => /\d+(\.\d+)?\s*%/.test(c));
    if (!ratioCell && !percentageCell) {
      continue;
    }

    const ratioMatch = ratioCell ? ratioCell.match(/(\d+)\s*\/\s*(\d+)/) : null;
    const attended = ratioMatch ? Number(ratioMatch[1]) : null;
    const total = ratioMatch ? Number(ratioMatch[2]) : null;

    let percentage = percentageCell ? Number(percentageCell.replace("%", "").trim()) : null;
    if (percentage === null && attended !== null && total && total > 0) {
      percentage = Number(((attended / total) * 100).toFixed(2));
    }

    if (percentage === null || total === null || attended === null) {
      continue;
    }

    parsed.push({
      id: randomUUID(),
      subjectName: cells[0],
      attendedClasses: attended,
      totalClasses: total,
      attendancePercentage: percentage
    });
  }

  if (parsed.length) {
    return parsed;
  }

  // Fallback: SRM Attendance page uses columns: Hours Conducted, Hours Absent, Attn %.
  const lower = (value) => String(value || "").trim().toLowerCase();
  const headerRow = rows.find((cells) => {
    const cols = cells.map(lower);
    return (
      cols.includes("course title")
      && cols.some((c) => c.includes("hours conducted"))
      && cols.some((c) => c.includes("hours absent"))
      && cols.some((c) => c.includes("attn") || c.includes("attn %") || c.includes("attn%"))
    );
  });
  if (!headerRow) {
    return [];
  }

  const headerCols = headerRow.map(lower);
  const idxTitle = headerCols.indexOf("course title");
  const idxConducted = headerCols.findIndex((c) => c.includes("hours conducted"));
  const idxAbsent = headerCols.findIndex((c) => c.includes("hours absent"));
  const idxPct = headerCols.findIndex((c) => c.includes("attn"));

  const headerAt = rows.indexOf(headerRow);
  for (const cells of rows.slice(headerAt + 1)) {
    if (cells.length <= Math.max(idxTitle, idxConducted, idxAbsent, idxPct)) {
      continue;
    }

    const subjectName = String(cells[idxTitle] || "").trim();
    const total = Number(String(cells[idxConducted] || "").replace(/[^\d]/g, ""));
    const absent = Number(String(cells[idxAbsent] || "").replace(/[^\d]/g, ""));
    const pct = Number(String(cells[idxPct] || "").replace("%", "").trim());

    if (!subjectName || !Number.isFinite(total) || total <= 0 || !Number.isFinite(absent) || absent < 0) {
      continue;
    }

    const attended = Math.max(0, total - absent);
    const percentage = Number.isFinite(pct) ? pct : Number(((attended / total) * 100).toFixed(2));

    parsed.push({
      id: randomUUID(),
      subjectName,
      attendedClasses: attended,
      totalClasses: total,
      attendancePercentage: percentage
    });
  }

  return parsed;
}

function htmlToTextLines(html) {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "");

  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitColumnsFromLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return [];
  if (raw.includes("|")) {
    return raw.split("|").map((c) => c.trim()).filter(Boolean);
  }
  return raw.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
}

function parseAttendanceRowsFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const parsed = [];
  for (const line of lines) {
    if (
      /course title|hours conducted|hours absent|attn/i.test(line)
      || /overall attendance|attendance details/i.test(line)
    ) {
      continue;
    }

    // Pattern: "<subject>  <conducted>  <absent>  <pct>%"
    const compact = line.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*%?$/i);
    if (compact) {
      const subjectName = cleanText(compact[1]);
      const total = Number(compact[2]);
      const absent = Number(compact[3]);
      const pct = Number(compact[4]);
      if (subjectName && Number.isFinite(total) && total > 0 && Number.isFinite(absent) && absent >= 0) {
        parsed.push({
          id: randomUUID(),
          subjectName,
          attendedClasses: Math.max(0, total - absent),
          totalClasses: total,
          attendancePercentage: Number.isFinite(pct) ? pct : Number((((total - absent) / total) * 100).toFixed(2))
        });
        continue;
      }
    }

    // Pattern: "<subject>  <attended>/<total>  <pct>%"
    const ratio = line.match(/^(.+?)\s+(\d+)\s*\/\s*(\d+)\s+(\d+(?:\.\d+)?)\s*%?$/i);
    if (ratio) {
      const subjectName = cleanText(ratio[1]);
      const attended = Number(ratio[2]);
      const total = Number(ratio[3]);
      const pct = Number(ratio[4]);
      if (subjectName && Number.isFinite(attended) && Number.isFinite(total) && total > 0) {
        parsed.push({
          id: randomUUID(),
          subjectName,
          attendedClasses: Math.max(0, attended),
          totalClasses: total,
          attendancePercentage: Number.isFinite(pct) ? pct : Number(((attended / total) * 100).toFixed(2))
        });
      }
    }
  }

  return parsed;
}

function parseAttendanceDailyEntries(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const entries = [];
  for (const line of lines) {
    // Example variants:
    // "12-02-2026 DBMS Present"
    // "12/02/2026 Computer Networks Absent"
    const m = line.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b\s+(.+?)\s+\b(present|absent)\b/i);
    if (!m) continue;

    const rawDate = m[1];
    const dateParts = rawDate.split(/[\/\-]/).map((v) => Number(v));
    let [dd, mm, yy] = dateParts;
    if (yy < 100) yy += 2000;
    const dt = new Date(yy, (mm || 1) - 1, dd || 1);
    if (Number.isNaN(dt.getTime())) continue;

    entries.push({
      date: dt.toISOString().slice(0, 10),
      subjectName: cleanText(m[2]).slice(0, 255),
      status: String(m[3] || "").toLowerCase() === "present" ? "present" : "absent"
    });
  }

  return entries;
}

function normalizeAttendanceRows(rows) {
  const sanitized = [];
  for (const row of rows || []) {
    const subjectName = cleanText(row?.subjectName || "").slice(0, 255);
    const attended = Number(row?.attendedClasses);
    const total = Number(row?.totalClasses);
    let pct = Number(row?.attendancePercentage);
    const lowered = subjectName.toLowerCase();
    const looksLikeNoise = (
      lowered.includes("emergency contact")
      || lowered.includes("mobile")
      || lowered.includes("phone")
      || lowered.includes("email")
      || lowered.includes("address")
      || lowered.includes("parent")
      || lowered.includes("guardian")
      || lowered.includes("click here")
      || lowered.includes("http")
    );
    const hasAcademicLikeChars = /[a-z]/i.test(subjectName) && /[a-z]{2,}/i.test(subjectName);
    if (
      !subjectName
      || looksLikeNoise
      || !hasAcademicLikeChars
      || !Number.isFinite(attended)
      || !Number.isFinite(total)
      || total <= 0
      || attended < 0
    ) {
      continue;
    }
    const safeTotal = Math.round(total);
    const safeAttended = Math.min(safeTotal, Math.max(0, Math.round(attended)));
    const computedPct = Number(((safeAttended / safeTotal) * 100).toFixed(2));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(pct - computedPct) > 5) {
      pct = computedPct;
    }
    sanitized.push({
      id: row?.id || randomUUID(),
      subjectName,
      attendedClasses: safeAttended,
      totalClasses: safeTotal,
      attendancePercentage: Number(pct.toFixed(2))
    });
  }

  const normalizeName = (name) => String(name || "")
    .toLowerCase()
    .replace(/\b(regular|theory|dr|prof|mr|mrs|ms)\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const subjectScore = (name) => {
    const lowered = String(name || "").toLowerCase();
    let score = String(name || "").length;
    if (/^regular\b/.test(lowered)) score += 40;
    if (/\b(tp|ub|lab)\s*\d{2,4}\b/.test(lowered)) score += 20;
    if (/\b(dr|prof|mr|mrs|ms)\b/.test(lowered)) score += 20;
    return score;
  };

  const deduped = [];
  for (const row of sanitized) {
    const rowName = normalizeName(row.subjectName);
    let replaced = false;
    for (let i = 0; i < deduped.length; i += 1) {
      const existing = deduped[i];
      if (existing.attendedClasses !== row.attendedClasses || existing.totalClasses !== row.totalClasses) continue;

      const existingName = normalizeName(existing.subjectName);
      const duplicateByName = (
        existingName === rowName
        || existingName.includes(rowName)
        || rowName.includes(existingName)
      );
      if (!duplicateByName) continue;

      if (subjectScore(row.subjectName) < subjectScore(existing.subjectName)) {
        deduped[i] = row;
      }
      replaced = true;
      break;
    }
    if (!replaced) deduped.push(row);
  }

  return deduped.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

function normalizeDailyEntries(entries) {
  const out = [];
  const seen = new Set();
  for (const e of entries || []) {
    const date = String(e?.date || "").slice(0, 10);
    const subjectName = cleanText(e?.subjectName || "").slice(0, 255);
    const status = String(e?.status || "").toLowerCase() === "present" ? "present" : "absent";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !subjectName) continue;
    const key = `${date}|${subjectName.toLowerCase()}|${status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, subjectName, status });
  }
  return out.sort((a, b) => `${a.date}|${a.subjectName}|${a.status}`.localeCompare(`${b.date}|${b.subjectName}|${b.status}`));
}

function computeAttendanceVersion(rows) {
  const canonical = JSON.stringify(
    (rows || []).map((r) => ({
      subjectName: r.subjectName,
      attendedClasses: r.attendedClasses,
      totalClasses: r.totalClasses,
      attendancePercentage: r.attendancePercentage
    }))
  );
  return createHash("sha256").update(canonical).digest("hex");
}

function parseAndNormalizeAttendance({ html, text }) {
  const fromHtml = parseAttendanceRows(html);
  const fromText = parseAttendanceRowsFromText(text);
  const normalized = normalizeAttendanceRows([...fromHtml, ...fromText]);
  const dailyEntries = normalizeDailyEntries(parseAttendanceDailyEntries(text));
  return {
    attendance: normalized,
    dailyEntries,
    version: computeAttendanceVersion(normalized)
  };
}

function deepCollectObjects(value, out = [], seen = new Set()) {
  if (!value || typeof value !== "object") return out;
  if (seen.has(value)) return out;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepCollectObjects(item, out, seen);
    }
    return out;
  }

  out.push(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      deepCollectObjects(nested, out, seen);
    }
  }
  return out;
}

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z]/g, "");
}

function getFieldByNormalizedKeys(obj, keys) {
  const keySet = new Set((keys || []).map((k) => normalizeKey(k)));
  for (const [k, v] of Object.entries(obj || {})) {
    if (keySet.has(normalizeKey(k))) {
      return v;
    }
  }
  return null;
}

function parseNumberLoose(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const num = Number(cleaned[0]);
  return Number.isFinite(num) ? num : null;
}

function asAttendanceRowFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  const subject = getFieldByNormalizedKeys(obj, [
    "courseTitle", "subjectName", "courseName", "subject", "course", "paperName", "title"
  ]);
  const total = getFieldByNormalizedKeys(obj, [
    "hoursConducted", "totalClasses", "conductedHours", "totalHours", "classesConducted", "conducted"
  ]);
  const absent = getFieldByNormalizedKeys(obj, [
    "hoursAbsent", "absentClasses", "absentHours", "absent"
  ]);
  const attended = getFieldByNormalizedKeys(obj, [
    "hoursAttended", "attendedClasses", "attendedHours", "attended", "presentClasses"
  ]);
  const pct = getFieldByNormalizedKeys(obj, [
    "attendancePercentage", "attnPercentage", "attendancePercent", "attn", "percentage", "attPercentage"
  ]);

  const subjectName = cleanText(subject || "");
  if (!subjectName || subjectName.length < 2) return null;

  const totalNum = parseNumberLoose(total);
  if (!Number.isFinite(totalNum) || totalNum <= 0) return null;

  let attendedNum = parseNumberLoose(attended);
  const absentNum = parseNumberLoose(absent);
  let pctNum = parseNumberLoose(pct);

  if (!Number.isFinite(attendedNum) && Number.isFinite(absentNum)) {
    attendedNum = Math.max(0, totalNum - absentNum);
  }
  if (!Number.isFinite(attendedNum)) {
    if (Number.isFinite(pctNum)) {
      if (pctNum > 0 && pctNum <= 1) pctNum *= 100;
      attendedNum = (pctNum / 100) * totalNum;
    } else {
      return null;
    }
  }

  const safeTotal = Math.round(totalNum);
  const safeAttended = Math.max(0, Math.min(safeTotal, Math.round(attendedNum)));
  const computedPct = Number(((safeAttended / safeTotal) * 100).toFixed(2));
  if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100) {
    pctNum = computedPct;
  }

  return {
    id: randomUUID(),
    subjectName: subjectName.slice(0, 255),
    attendedClasses: safeAttended,
    totalClasses: safeTotal,
    attendancePercentage: Number(pctNum.toFixed(2))
  };
}

function parseAttendanceRowsFromJsonPayloads(payloads) {
  const objects = [];
  for (const payload of payloads || []) {
    deepCollectObjects(payload, objects);
  }

  const rows = [];
  for (const obj of objects) {
    const row = asAttendanceRowFromObject(obj);
    if (row) {
      rows.push(row);
    }
  }
  return normalizeAttendanceRows(rows);
}

function asTimetableRowFromObject(obj) {
  if (!obj || typeof obj !== "object") return null;
  const subject = getFieldByNormalizedKeys(obj, [
    "courseTitle", "subjectName", "courseName", "subject", "course", "paperName", "title", "courseCode", "subjectCode"
  ]);
  const subjectName = cleanText(subject || "");
  if (!subjectName || subjectName.length < 2) return null;

  const dayLabelRaw = getFieldByNormalizedKeys(obj, ["dayLabel", "day", "weekday", "slot", "dayName", "dayOrderName"]);
  const dayOrderRaw = getFieldByNormalizedKeys(obj, ["dayOrder", "dayNumber", "dayNo", "dayIndex"]);
  const startRaw = getFieldByNormalizedKeys(obj, ["startTime", "fromTime", "beginTime", "start", "periodStart", "startSlot"]);
  const endRaw = getFieldByNormalizedKeys(obj, ["endTime", "toTime", "finishTime", "end", "periodEnd", "endSlot"]);
  const facultyRaw = getFieldByNormalizedKeys(obj, ["facultyName", "faculty", "staffName", "faculty_name"]);
  const roomRaw = getFieldByNormalizedKeys(obj, ["roomLabel", "room", "classroom", "room_number"]);

  const dayLabel = dayLabelRaw ? cleanText(dayLabelRaw).slice(0, 50) : null;
  const dayOrderNum = parseNumberLoose(dayOrderRaw);
  const dayOrder = Number.isFinite(dayOrderNum) ? Math.max(1, Math.min(7, Math.round(dayOrderNum))) : parseDayOrder(dayLabel || "");

  const startTime = normalizeTime(startRaw) || null;
  const endTime = normalizeTime(endRaw) || null;

  return {
    id: randomUUID(),
    dayOrder,
    dayLabel,
    startTime,
    endTime,
    subjectName: subjectName.slice(0, 255),
    facultyName: facultyRaw ? cleanText(facultyRaw).slice(0, 255) : null,
    roomLabel: roomRaw ? cleanText(roomRaw).slice(0, 255) : null
  };
}

function dedupeTimetableRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = [
      row.dayOrder || "",
      String(row.dayLabel || "").toLowerCase(),
      String(row.startTime || ""),
      String(row.endTime || ""),
      String(row.subjectName || "").toLowerCase()
    ].join("|");
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function dedupeMarksRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = [
      String(row.subjectName || "").toLowerCase().trim(),
      String(row.componentName || "").toLowerCase().trim(),
      Number(row.score || 0),
      Number(row.maxScore || 0)
    ].join("|");
    if (!map.has(key)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

function parseTimetableRowsFromJsonPayloads(payloads) {
  const objects = [];
  for (const payload of payloads || []) {
    deepCollectObjects(payload, objects);
  }
  const out = [];
  for (const obj of objects) {
    const row = asTimetableRowFromObject(obj);
    if (row) out.push(row);
  }
  return dedupeTimetableRows(out);
}

function parseMarksRowsFromJsonPayloads(payloads, timetableRows = []) {
  const objects = [];
  for (const payload of payloads || []) {
    deepCollectObjects(payload, objects);
  }

  const codeToTitle = new Map();
  for (const row of timetableRows || []) {
    const code = normalizeCourseCode(row?.courseCode || row?.subjectName || "");
    const title = cleanText(row?.subjectName || "");
    if (isCourseCodeLike(code) && title && !codeToTitle.has(code)) {
      codeToTitle.set(code, title);
    }
  }

  const rows = [];
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;
    const subjectRaw = getFieldByNormalizedKeys(obj, [
      "subjectName", "courseTitle", "courseName", "subject", "course", "paperName", "title", "courseCode", "subjectCode"
    ]);
    let subjectName = cleanText(subjectRaw || "").slice(0, 255);
    if (!subjectName) continue;
    const subjectCode = normalizeCourseCode(subjectName);
    if (isCourseCodeLike(subjectCode) && codeToTitle.has(subjectCode)) {
      subjectName = codeToTitle.get(subjectCode);
    }

    const perfText = cleanText(getFieldByNormalizedKeys(obj, [
      "testPerformance", "performance", "marksDetail", "componentMarks", "assessmentDetail"
    ]) || "");
    if (perfText) {
      const matches = [...perfText.matchAll(/([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g)];
      for (const match of matches) {
        const componentName = cleanText(match[1] || "").slice(0, 255);
        const maxScore = Number(match[2]);
        const score = Number(match[3]);
        if (!componentName || !Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) continue;
        rows.push({
          id: randomUUID(),
          subjectName,
          componentName,
          score,
          maxScore,
          percentage: Number(((score / maxScore) * 100).toFixed(2))
        });
      }
    }

    const componentRaw = getFieldByNormalizedKeys(obj, [
      "componentName", "component", "testName", "assessmentName", "examType", "componentType"
    ]);
    const scoreRaw = getFieldByNormalizedKeys(obj, [
      "score", "obtained", "marksObtained", "obtainedMarks", "securedMarks", "marks"
    ]);
    const maxRaw = getFieldByNormalizedKeys(obj, [
      "maxScore", "maxMarks", "outOf", "totalMarks", "fullMarks"
    ]);

    const componentName = cleanText(componentRaw || "").slice(0, 255);
    const score = parseNumberLoose(scoreRaw);
    const maxScore = parseNumberLoose(maxRaw);
    if (componentName && Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0 && score >= 0) {
      rows.push({
        id: randomUUID(),
        subjectName,
        componentName,
        score,
        maxScore,
        percentage: Number(((score / maxScore) * 100).toFixed(2))
      });
    }
  }

  return dedupeMarksRows(rows);
}

function extractHiddenFields(html) {
  const inputs = [...String(html || "").matchAll(/<input[^>]*type=['"]hidden['"][^>]*>/gi)].map((m) => m[0]);
  const result = {};

  for (const input of inputs) {
    const nameMatch = input.match(/name=['"]([^'"]+)['"]/i);
    const valueMatch = input.match(/value=['"]([^'"]*)['"]/i);
    if (!nameMatch) {
      continue;
    }
    result[nameMatch[1]] = valueMatch ? valueMatch[1] : "";
  }

  return result;
}

function buildCookieHeader(setCookieHeaders = [], currentCookieHeader = "") {
  const jar = {};

  for (const part of String(currentCookieHeader || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key || !rest.length) continue;
    jar[key] = rest.join("=");
  }

  for (const raw of setCookieHeaders) {
    const [pair] = String(raw || "").split(";");
    const [key, ...rest] = pair.trim().split("=");
    if (!key || !rest.length) continue;
    jar[key] = rest.join("=");
  }

  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function getCookieValue(cookieHeader = "", name) {
  const parts = String(cookieHeader || "").split(";").map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return "";
}

async function fetchText(url, {
  method = "GET",
  body = null,
  cookieHeader = "",
  headers: extraHeaders = {},
  timeoutMs = null
} = {}) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (GAK Integration Bot)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...extraHeaders
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const requestInit = { method, headers };
  if (body !== null && body !== undefined) {
    // Zoho IAM endpoints use this content-type even when sending JSON strings.
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    }
    requestInit.body = body;
  }

  const effectiveTimeout = Math.max(2000, Number(timeoutMs || process.env.ACADEMIA_HTTP_TIMEOUT_MS || 20000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);
  requestInit.signal = controller.signal;

  let response;
  try {
    response = await fetch(url, requestInit);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Academia upstream timeout after ${effectiveTimeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const setCookies = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);

  return {
    ok: response.ok,
    status: response.status,
    text,
    setCookies,
    finalUrl: response.url
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function deepFindFirst(obj, key, depth = 0, maxDepth = 8, seen = new Set()) {
  if (!obj || typeof obj !== "object" || depth > maxDepth) return null;
  if (seen.has(obj)) return null;
  seen.add(obj);

  if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
    return obj[key];
  }

  for (const value of Object.values(obj)) {
    const found = deepFindFirst(value, key, depth + 1, maxDepth, seen);
    if (found !== null && found !== undefined && found !== "") return found;
  }

  return null;
}

function extractLookupFields(payload) {
  const candidates = [
    payload?.lookup,
    payload?.data?.lookup,
    payload?.data,
    payload
  ].filter(Boolean);

  const pick = (key) => {
    for (const obj of candidates) {
      if (obj && typeof obj === "object" && obj[key]) return obj[key];
      if (obj && typeof obj === "object" && obj.lookup && obj.lookup[key]) return obj.lookup[key];
    }
    return null;
  };

  const digest = pick("digest");
  const zuid = pick("zuid");
  const status = pick("status");

  return {
    digest: digest || deepFindFirst(payload, "digest"),
    zuid: zuid || deepFindFirst(payload, "zuid"),
    status: status || deepFindFirst(payload, "status"),
    raw: candidates[0] || payload
  };
}

function isSuccessStatus(value) {
  const text = String(value || "").toLowerCase();
  return text === "success" || text === "ok";
}

function extractZohoError(payload) {
  const message =
    payload?.localized_message
    || payload?.message
    || payload?.error
    || payload?.errors?.[0]?.message
    || null;
  return message ? String(message) : null;
}

async function loginZohoIam({ baseUrl, uriPrefix, collegeEmail, collegePassword }) {
  // Load sign-in page (sets iamcsr + other cookies).
  const signinUrl =
    process.env.ACADEMIA_SIGNIN_URL
    || `${baseUrl}${uriPrefix}/signin?hide_fp=true&orgtype=40&service_language=en&dcc=true`;

  let cookieHeader = "";
  const signinPage = await fetchText(signinUrl, { method: "GET" });
  cookieHeader = buildCookieHeader(signinPage.setCookies, cookieHeader);

  const iamcsr = getCookieValue(cookieHeader, "iamcsr");
  const csrfHeader = `iamcsrcoo=${encodeURIComponent(iamcsr || "")}`;

  const signinParams = new URLSearchParams({
    cli_time: String(Date.now()),
    orgtype: "40",
    service_language: "en"
  }).toString();

  // Lookup: POST form body (Zoho IAM uses XHR POST)
  const lookupUrl = `${baseUrl}${uriPrefix}/signin/v2/lookup/${encodeURIComponent(collegeEmail)}`;
  const lookupResp = await fetchText(lookupUrl, {
    method: "POST",
    body: `mode=primary&${signinParams}`,
    cookieHeader,
    headers: {
      Accept: "application/json, text/plain, */*",
      "X-ZCSRF-TOKEN": csrfHeader,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    }
  });
  cookieHeader = buildCookieHeader(lookupResp.setCookies, cookieHeader);

  const lookupJson = safeJsonParse(lookupResp.text);
  if (!lookupJson) {
    throw new Error(lookupResp.ok ? "Academia login lookup failed: response was not JSON" : `Academia login lookup failed with HTTP ${lookupResp.status}`);
  }

  const { digest, zuid, status } = extractLookupFields(lookupJson);
  if (!digest || !zuid) {
    const reason = extractZohoError(lookupJson);
    // Some lookup responses include status_code/message while still providing lookup data in nested fields.
    // Only treat status_code as fatal if we also failed to extract digest/zuid.
    if (lookupJson.status_code && Number(lookupJson.status_code) >= 400) {
      throw new Error(reason ? `Academia login lookup failed: ${reason}` : "Academia login lookup failed");
    }
    if (!lookupResp.ok) {
      throw new Error(reason ? `Academia login lookup failed: ${reason}` : `Academia login lookup failed with HTTP ${lookupResp.status}`);
    }
    throw new Error(reason ? `Academia login lookup failed: ${reason}` : "Academia login lookup failed: missing digest/zuid");
  }
  if (status && !isSuccessStatus(status)) {
    throw new Error("Academia login lookup failed");
  }

  // Password auth: POST body; query includes digest + signin params
  const passwordUrl =
    `${baseUrl}${uriPrefix}/signin/v2/primary/${encodeURIComponent(zuid)}/password`
    + `?digest=${encodeURIComponent(digest)}&${signinParams}`;

  const passwordBody = JSON.stringify({ passwordauth: { password: collegePassword } });

  const passwordResp = await fetchText(passwordUrl, {
    method: "POST",
    body: passwordBody,
    cookieHeader,
    headers: {
      Accept: "application/json, text/plain, */*",
      "X-ZCSRF-TOKEN": csrfHeader,
      "Content-Type": "application/json;charset=UTF-8"
    }
  });
  cookieHeader = buildCookieHeader(passwordResp.setCookies, cookieHeader);

  const passwordJson = safeJsonParse(passwordResp.text);
  if (!passwordJson) {
    throw new Error(passwordResp.ok ? "Academia login failed: response was not JSON" : `Academia login failed with HTTP ${passwordResp.status}`);
  }

  const pass = passwordJson.passwordauth || passwordJson.data?.passwordauth || passwordJson;
  const passStatus = pass?.status || pass?.passwordauth?.status || null;
  // Similar to lookup: only treat status_code as fatal if we don't have a clear success status.
  if (passwordJson.status_code && Number(passwordJson.status_code) >= 400 && !isSuccessStatus(passStatus)) {
    const reason = extractZohoError(passwordJson);
    throw new Error(reason ? `Academia login failed: ${reason}` : "Academia login failed");
  }
  if (!passwordResp.ok && !isSuccessStatus(passStatus)) {
    const reason = extractZohoError(passwordJson);
    throw new Error(reason ? `Academia login failed: ${reason}` : `Academia login failed with HTTP ${passwordResp.status}`);
  }
  if (passStatus && !isSuccessStatus(passStatus)) {
    const reason = extractZohoError(pass) || extractZohoError(passwordJson);
    throw new Error(reason ? `Academia login failed: ${reason}` : "Academia login failed. Check college email/password.");
  }

  // If provided, follow redirect once to finalize session cookies.
  const redirectUri = pass?.redirect_uri || pass?.passwordauth?.redirect_uri || null;
  if (redirectUri) {
    const finalResp = await fetchText(redirectUri, { method: "GET", cookieHeader });
    cookieHeader = buildCookieHeader(finalResp.setCookies, cookieHeader);
  }

  return { cookieHeader };
}

async function scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword }) {
  const baseUrl = process.env.ACADEMIA_BASE_URL || "https://academia.srmist.edu.in";
  const uriPrefix = process.env.ACADEMIA_ZOHO_URI_PREFIX || "/accounts/p/40-10002227248";
  const timetableUrl = process.env.ACADEMIA_TIMETABLE_URL || `${baseUrl}/student/timetable`;
  const marksUrl = process.env.ACADEMIA_MARKS_URL || `${baseUrl}/student/marks`;
  const attendanceUrl = process.env.ACADEMIA_ATTENDANCE_URL || `${baseUrl}/student/attendance`;

  const { cookieHeader } = await loginZohoIam({
    baseUrl,
    uriPrefix,
    collegeEmail: String(collegeEmail || "").trim().toLowerCase(),
    collegePassword: String(collegePassword || "")
  });

  const [timetablePage, marksPage, attendancePage] = await Promise.all([
    fetchText(timetableUrl, { cookieHeader }),
    fetchText(marksUrl, { cookieHeader }),
    fetchText(attendanceUrl, { cookieHeader })
  ]);

  if (!timetablePage.ok || !marksPage.ok || !attendancePage.ok) {
    throw new Error("Unable to fetch one or more academia pages. Verify page URLs in environment.");
  }

  const timetableText = htmlToTextLines(timetablePage.text).join("\n");
  const marksText = htmlToTextLines(marksPage.text).join("\n");
  const attendanceText = htmlToTextLines(attendancePage.text).join("\n");

  const timetableFromHtml = parseTimetableRows(timetablePage.text);
  const marksFromHtml = parseMarksRows(marksPage.text);
  const attendanceParsed = parseAndNormalizeAttendance({
    html: attendancePage.text,
    text: attendanceText
  });

  const timetable = timetableFromHtml.length ? timetableFromHtml : parseTimetableRowsFromText(timetableText);
  const marks = marksFromHtml.length ? marksFromHtml : parseMarksRowsFromText(marksText);
  const attendance = attendanceParsed.attendance;

  return {
    timetable,
    marks,
    attendance,
    attendanceDaily: attendanceParsed.dailyEntries,
    attendanceVersion: attendanceParsed.version
  };
}

async function fillFirstVisible(target, selectors, value, timeoutMs = 4000) {
  for (const selector of selectors) {
    const locator = target.locator(selector).first();
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: timeoutMs });
        await locator.fill(value);
        return true;
      }
    } catch (_error) {
      continue;
    }
  }
  return false;
}

async function clickFirstVisible(target, selectors, timeoutMs = 4000) {
  for (const selector of selectors) {
    const locator = target.locator(selector).first();
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: timeoutMs });
        await locator.click();
        return true;
      }
    } catch (_error) {
      continue;
    }
  }
  return false;
}

async function getBodyText(target) {
  try {
    return String(await target.textContent("body")).toLowerCase();
  } catch (_error) {
    return "";
  }
}

async function pageHasCaptchaChallenge(target) {
  try {
    const bodyText = await getBodyText(target);
    return (
      bodyText.includes("captcha")
      || bodyText.includes("i am not a robot")
      || bodyText.includes("verify you are human")
      || bodyText.includes("recaptcha")
      || bodyText.includes("hcaptcha")
    );
  } catch (_error) {
    return false;
  }
}

async function pageHasMfaChallenge(target) {
  try {
    const bodyText = await getBodyText(target);
    const url = typeof target.url === "function" ? String(target.url() || "").toLowerCase() : "";
    const keywordHit = (
      bodyText.includes("one-time password")
      || bodyText.includes("verification code")
      || bodyText.includes("enter otp")
      || bodyText.includes("authenticator app")
      || bodyText.includes("2-step")
      || bodyText.includes("two-factor")
    );
    const urlHit = (
      url.includes("otp")
      || url.includes("mfa")
      || url.includes("twofactor")
      || url.includes("verify")
      || url.includes("challenge")
    );
    const otpFieldCount = await target
      .locator("input[name*='otp' i], input[id*='otp' i], input[name*='totp' i], input[id*='totp' i], input[autocomplete='one-time-code']")
      .count()
      .catch(() => 0);
    const verifyButtonCount = await target
      .locator("button:has-text('Verify'), button:has-text('Submit code'), button:has-text('Continue')")
      .count()
      .catch(() => 0);

    // Avoid false positives from generic login text. Require URL signal or OTP UI controls.
    return Boolean((keywordHit && (urlHit || otpFieldCount > 0 || verifyButtonCount > 0)) || otpFieldCount > 0);
  } catch (_error) {
    return false;
  }
}

async function pageHasInvalidCredentialMessage(target) {
  try {
    const bodyText = await getBodyText(target);
    return (
      bodyText.includes("invalid password")
      || bodyText.includes("incorrect password")
      || bodyText.includes("invalid credentials")
      || bodyText.includes("wrong password")
    );
  } catch (_error) {
    return false;
  }
}

async function resolveZohoLoginTargets(page) {
  const targets = [];

  // Prefer explicit Zoho iframe used by the SRM login shell page.
  const iframeCandidates = [
    "iframe#signinFrame",
    "iframe[name='zohoiam']",
    "iframe[src*='/accounts/p/']"
  ];

  for (const selector of iframeCandidates) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        const handle = await locator.elementHandle();
        const frame = handle ? await handle.contentFrame() : null;
        if (frame) {
          targets.push(frame);
        }
      }
    } catch (_error) {
      continue;
    }
  }

  // Keep page root as fallback for direct-login variants.
  targets.push(page);
  return targets;
}

async function fillOnAnyTarget(targets, selectors, value, timeoutMs = 4000) {
  for (const target of targets) {
    const ok = await fillFirstVisible(target, selectors, value, timeoutMs);
    if (ok) {
      return true;
    }
  }
  return false;
}

async function clickOnAnyTarget(targets, selectors, timeoutMs = 4000) {
  for (const target of targets) {
    const ok = await clickFirstVisible(target, selectors, timeoutMs);
    if (ok) {
      return true;
    }
  }
  return false;
}

async function anyTargetHasCaptcha(targets) {
  for (const target of targets) {
    if (await pageHasCaptchaChallenge(target)) {
      return true;
    }
  }
  return false;
}

async function anyTargetHasMfa(targets) {
  for (const target of targets) {
    if (await pageHasMfaChallenge(target)) {
      return true;
    }
  }
  return false;
}

async function anyTargetHasInvalidCredentials(targets) {
  for (const target of targets) {
    if (await pageHasInvalidCredentialMessage(target)) {
      return true;
    }
  }
  return false;
}

async function pageHasSessionLimitExceeded(page) {
  try {
    const url = String(page.url() || "");
    if (url.includes("block-sessions")) {
      return true;
    }
    const bodyText = String(await page.textContent("body")).toLowerCase();
    return bodyText.includes("maximum concurrent sessions") || bodyText.includes("concurrent active sessions limit exceeded");
  } catch (_error) {
    return false;
  }
}

async function maybeResolveSessionLimitExceeded(page) {
  const allowTerminate = String(process.env.ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT || "").toLowerCase() === "true";
  if (!allowTerminate) {
    return false;
  }

  // This logs the user out from all SRM/Zoho sessions for this account.
  await clickFirstVisible(page, ["button:has-text('Terminate All Sessions')", "button:has-text('Terminate all sessions')"], 4000);
  await page.waitForTimeout(2500);
  return true;
}

async function loginViaBrowser(page, { baseUrl, collegeEmail, collegePassword }) {
  const loginEntryUrl = process.env.ACADEMIA_SIGNIN_URL || baseUrl;
  await page.goto(loginEntryUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  let targets = await resolveZohoLoginTargets(page);

  // Zoho IAM sign-in typically prompts for email first, then password.
  const emailOk = await fillOnAnyTarget(
    targets,
    ["#login_id", "input[name='login_id']", "input[name='LOGIN_ID']", "input[name='username']", "input[type='email']"],
    collegeEmail
  );
  if (!emailOk) {
    throw new Error("Academia login failed: unable to find email input on sign-in page");
  }

  await clickOnAnyTarget(targets, ["#nextbtn", "button:has-text('Next')", "button:has-text('Continue')", "button:has-text('Sign in')"]);
  await page.waitForTimeout(1200);
  targets = await resolveZohoLoginTargets(page);

  if (await anyTargetHasCaptcha(targets)) {
    throw new Error(
      "Academia login blocked by captcha challenge. Complete login manually once and retry sync (use scripts/academia_capture_state.js to save a session state)."
    );
  }
  if (await anyTargetHasMfa(targets)) {
    throw new Error("Academia login requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
  }

  const passwordOk = await fillOnAnyTarget(
    targets,
    ["#password", "input[name='password']", "input[name='PASSWORD']", "input[type='password']"],
    collegePassword
  );
  if (!passwordOk) {
    if (await anyTargetHasCaptcha(targets)) {
      throw new Error(
        "Academia login blocked by captcha challenge. Complete login manually once and retry sync (use scripts/academia_capture_state.js to save a session state)."
      );
    }
    if (await anyTargetHasMfa(targets)) {
      throw new Error("Academia login requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
    }
    throw new Error("Academia login failed: unable to find password input");
  }

  await clickOnAnyTarget(targets, ["#nextbtn", "button:has-text('Sign in')", "button:has-text('Sign In')", "button:has-text('Login')"]);

  // Wait until we land back on the academia app or a hash-page URL.
  await page.waitForTimeout(1500);
  targets = await resolveZohoLoginTargets(page);

  if (await pageHasSessionLimitExceeded(page)) {
    const resolved = await maybeResolveSessionLimitExceeded(page);
    if (!resolved) {
      throw new Error(
        "Academia login blocked: maximum concurrent sessions limit exceeded. Sign out of SRM/Zoho on other devices, or set ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT=true to auto-terminate sessions and retry."
      );
    }
    // Give the post-termination redirect time to settle.
    await page.waitForTimeout(2500);
    targets = await resolveZohoLoginTargets(page);
  }

  // Some accounts get a "terminate sessions" or "trust device" interstitial after login.
  // We best-effort click through without failing if elements are absent.
  await clickOnAnyTarget(
    targets,
    [
      "#terminate_session_skip",
      "#terminate_session_submit",
      "button:has-text('Skip')",
      "button:has-text('Continue')",
      "button:has-text('Not now')",
      "button:has-text('Trust')"
    ],
    2500
  ).catch(() => undefined);
  await page.waitForTimeout(1200);
  targets = await resolveZohoLoginTargets(page);

  if (await anyTargetHasCaptcha(targets)) {
    throw new Error(
      "Academia login blocked by captcha challenge. Complete login manually once and retry sync (use scripts/academia_capture_state.js to save a session state)."
    );
  }
  if (await anyTargetHasMfa(targets)) {
    throw new Error("Academia login requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
  }

  if (await anyTargetHasInvalidCredentials(targets)) {
    throw new Error("Academia login failed: invalid college credentials");
  }

  // Accept either the academia app domain or remaining on Zoho accounts sub-path (cookies are still valid).
  await page.waitForURL(/academia\.srmist\.edu\.in/i, { timeout: 60000 }).catch(() => undefined);
}

async function scrapeAcademiaDataWithPlaywright({ collegeEmail, collegePassword, storageStatePath = null, storageState = null }) {
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `cd gak-backend && npm i playwright` to enable SRM Academia scraping.");
  }

  const baseUrl = process.env.ACADEMIA_BASE_URL || "https://academia.srmist.edu.in";
  const attendanceUrl = process.env.ACADEMIA_ATTENDANCE_URL || `${baseUrl}/#Page:My_Attendance`;
  const timetableUrl = process.env.ACADEMIA_TIMETABLE_URL || `${baseUrl}/#Page:My_Time_Table`;
  const marksUrl = process.env.ACADEMIA_MARKS_URL || `${baseUrl}/#Page:My_Marks`;
  const attendanceCandidateUrls = [...new Set([
    attendanceUrl,
    `${baseUrl}/#Page:My_Attendance`,
    `${baseUrl}/#Page:Academic_Reports_Unified`,
    `${baseUrl}/#Page:My_Time_Table`
  ])];
  const timetableCandidateUrls = [...new Set([
    timetableUrl,
    `${baseUrl}/#Page:My_Time_Table`,
    `${baseUrl}/#Page:Academic_Reports_Unified`,
    `${baseUrl}/student/timetable`
  ])];
  const marksCandidateUrls = [...new Set([
    marksUrl,
    `${baseUrl}/#Page:My_Marks`,
    `${baseUrl}/#Page:Academic_Reports_Unified`,
    `${baseUrl}/student/marks`
  ])];

  const headlessRaw = String(process.env.ACADEMIA_PLAYWRIGHT_HEADLESS || "").trim().toLowerCase();
  const headless = headlessRaw === "false" ? false : true;
  const debug = String(process.env.ACADEMIA_DEBUG_SCRAPE || "").toLowerCase() === "true";
  const effectiveStatePath = storageStatePath || String(process.env.ACADEMIA_STORAGE_STATE_PATH || "").trim();

  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    storageState: storageState || (effectiveStatePath ? effectiveStatePath : undefined)
  });
  const page = await context.newPage();
  const jsonPayloads = [];

  const responseListener = async (response) => {
    try {
      const headers = response.headers();
      const contentType = String(headers["content-type"] || "");
      if (!contentType.toLowerCase().includes("application/json")) {
        return;
      }
      const url = String(response.url() || "").toLowerCase();
      if (!url.includes("academia.srmist.edu.in") && !url.includes("/api/") && !url.includes("zoho")) {
        return;
      }
      const text = await response.text().catch(() => "");
      if (!text || text.length > 2_000_000) {
        return;
      }
      const parsed = safeJsonParse(text);
      if (parsed && typeof parsed === "object") {
        jsonPayloads.push(parsed);
      }
    } catch (_error) {
      // ignore response parsing failures
    }
  };
  page.on("response", responseListener);

  try {
    // If we have a valid storageState, we might already be authenticated.
    // Only run the login flow when the login iframe is present.
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => undefined);
    await page.waitForTimeout(1200);

    const hasLoginIframe = (await page.locator("iframe#signinFrame, iframe[name='zohoiam'], iframe[src*='/accounts/p/']").count().catch(() => 0)) > 0;
    if (hasLoginIframe) {
      await loginViaBrowser(page, {
        baseUrl,
        collegeEmail: String(collegeEmail || "").trim().toLowerCase(),
        collegePassword: String(collegePassword || "")
      });
    }

    const gotoAndExtract = async (url, kind = "generic") => {
      // The SRM portal is a hash-based SPA and can keep long-polling connections open,
      // so `networkidle` is not always a reliable signal that data tables are rendered.
      const settleMs = Math.max(1500, Number(process.env.ACADEMIA_SPA_SETTLE_MS || 20000));

      const hashIdx = String(url || "").indexOf("#");
      const base = hashIdx >= 0 ? String(url).slice(0, hashIdx) : String(url);
      const hash = hashIdx >= 0 ? String(url).slice(hashIdx) : "";

      await page.goto(base || url, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (hash) {
        await page.evaluate((h) => {
          if (typeof h === "string" && h && window.location.hash !== h) {
            window.location.hash = h;
          }
        }, hash).catch(() => undefined);
      }

      const start = Date.now();
      let lastHtml = null;
      let lastText = "";

      const dismissOverlaysBestEffort = async () => {
        const candidates = [
          "button:has-text('Skip')",
          "button:has-text('Not now')",
          "button:has-text('Later')",
          "button:has-text('Continue')",
          "[aria-label='Close']",
          "button[aria-label='Close']",
          "button:has-text('Close')"
        ];
        for (const sel of candidates) {
          await page.locator(sel).first().click({ timeout: 800 }).catch(() => undefined);
        }
      };

      const collectTargets = async () => {
        const frames = page.frames();
        const targets = [];
        for (const frame of frames) {
          // Ignore blank/utility frames.
          const frameUrl = String(frame.url() || "");
          if (frame !== page.mainFrame() && (!frameUrl || frameUrl === "about:blank")) {
            continue;
          }
          targets.push(frame);
        }
        return targets;
      };

      while (Date.now() - start < settleMs) {
        if (await pageHasCaptchaChallenge(page)) {
          throw new Error(
            "Academia scrape blocked by captcha challenge while loading page. Use scripts/academia_capture_state.js to save a session state and retry."
          );
        }
        if (await pageHasMfaChallenge(page)) {
          throw new Error("Academia scrape requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
        }

        await dismissOverlaysBestEffort().catch(() => undefined);

        const targets = await collectTargets();
        // Pick the frame that actually contains the data tables/text.
        let best = { html: "", text: "", score: 0 };
        for (const frame of targets) {
          const html = await frame.content().catch(() => "");
          const text = await frame.evaluate(() => String(document?.body?.innerText || "")).catch(() => "");
          const score = (html ? html.length : 0) + (text ? text.length * 2 : 0);
          if (score > best.score) {
            best = { html, text, score };
          }
        }
        const html = best.html || (await page.content().catch(() => ""));
        const text = best.text || "";
        lastHtml = html;
        lastText = text;

        // Prefer real parsing signals over brittle header text checks.
        if (kind === "attendance") {
          const attendanceParsed = parseAndNormalizeAttendance({ html, text });
          if (attendanceParsed.attendance.length > 0 || parseTimetableRows(html).length > 0 || parseTimetableRowsFromText(text).length > 0) {
            return { html, text };
          }
        } else if (kind === "timetable") {
          if (parseTimetableRows(html).length > 0 || parseTimetableRowsFromText(text).length > 0) {
            return { html, text };
          }
        } else if (kind === "marks") {
          if (parseMarksRows(html).length > 0 || parseMarksRowsFromText(text).length > 0) {
            return { html, text };
          }
        } else if (parseRowsFromHtmlTables(html).length > 0) {
          return { html, text };
        }

        await page.waitForTimeout(1200);
      }

      // Final attempt: return the last HTML even if our readiness heuristics didn't trigger.
      if (await pageHasCaptchaChallenge(page)) {
        throw new Error(
          "Academia scrape blocked by captcha challenge while loading page. Use scripts/academia_capture_state.js to save a session state and retry."
        );
      }
      if (await pageHasMfaChallenge(page)) {
        throw new Error("Academia scrape requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
      }
      return { html: lastHtml || (await page.content()), text: lastText };
    };

    let lastExtractError = null;
    let bestExtract = {
      attendance: [],
      attendanceDaily: [],
      attendanceVersion: null,
      timetable: [],
      marks: [],
      score: -1,
      sourceUrl: null
    };

    for (const candidateUrl of attendanceCandidateUrls) {
      try {
        const raw = await gotoAndExtract(candidateUrl, "attendance");
        const attendanceParsed = parseAndNormalizeAttendance({ html: raw.html, text: raw.text });
        const timetableFromHtml = parseTimetableRows(raw.html);
        const timetableFromText = parseTimetableRowsFromText(raw.text);
        const marksFromHtml = parseMarksRows(raw.html);
        const marksFromText = parseMarksRowsFromText(raw.text);

        const timetable = timetableFromHtml.length ? timetableFromHtml : timetableFromText;
        const marks = marksFromHtml.length ? marksFromHtml : marksFromText;
        const attendance = attendanceParsed.attendance || [];
        const score = (attendance.length * 1000) + (timetable.length * 100) + marks.length;
        if (debug) {
          console.log("[academia-scrape-debug] attendance candidate", {
            url: candidateUrl,
            attendanceRows: attendance.length,
            timetableRows: timetable.length,
            marksRows: marks.length
          });
        }

        if (score > bestExtract.score) {
          bestExtract = {
            attendance,
            attendanceDaily: attendanceParsed.dailyEntries || [],
            attendanceVersion: attendanceParsed.version || null,
            timetable,
            marks,
            score,
            sourceUrl: candidateUrl
          };
        }

        if (attendance.length > 0 && timetable.length > 0) {
          break;
        }
      } catch (error) {
        const msg = String(error?.message || "").toLowerCase();
        lastExtractError = error;
        if (msg.includes("captcha") || msg.includes("mfa") || msg.includes("manual action")) {
          throw error;
        }
      }
    }

    let bestTimetableRows = [...(bestExtract.timetable || [])];
    for (const candidateUrl of timetableCandidateUrls) {
      try {
        const raw = await gotoAndExtract(candidateUrl, "timetable");
        const timetableFromHtml = parseTimetableRows(raw.html);
        const timetableFromText = parseTimetableRowsFromText(raw.text);
        const candidateRows = timetableFromHtml.length ? timetableFromHtml : timetableFromText;
        if (debug) {
          const dayCountDebug = new Set(
            candidateRows.map((row) => Number(row.dayOrder)).filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
          ).size;
          console.log("[academia-scrape-debug] timetable candidate", {
            url: candidateUrl,
            rows: candidateRows.length,
            dayOrders: dayCountDebug
          });
        }
        if (candidateRows.length > bestTimetableRows.length) {
          bestTimetableRows = candidateRows;
        }
        const dayCount = new Set(
          candidateRows.map((row) => Number(row.dayOrder)).filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
        ).size;
        if (candidateRows.length > 0 && dayCount >= 5) {
          break;
        }
      } catch (error) {
        const msg = String(error?.message || "").toLowerCase();
        lastExtractError = error;
        if (msg.includes("captcha") || msg.includes("mfa") || msg.includes("manual action")) {
          throw error;
        }
      }
    }

    let bestMarksRows = [...(bestExtract.marks || [])];
    for (const candidateUrl of marksCandidateUrls) {
      try {
        const raw = await gotoAndExtract(candidateUrl, "marks");
        const marksFromHtml = parseMarksRows(raw.html);
        const marksFromText = parseMarksRowsFromText(raw.text);
        const candidateRows = marksFromHtml.length ? marksFromHtml : marksFromText;
        if (debug) {
          console.log("[academia-scrape-debug] marks candidate", {
            url: candidateUrl,
            rows: candidateRows.length
          });
        }
        if (candidateRows.length > bestMarksRows.length) {
          bestMarksRows = candidateRows;
        }
        if (candidateRows.length >= 3) {
          break;
        }
      } catch (error) {
        const msg = String(error?.message || "").toLowerCase();
        lastExtractError = error;
        if (msg.includes("captcha") || msg.includes("mfa") || msg.includes("manual action")) {
          throw error;
        }
      }
    }

    if (bestExtract.score < 0 && lastExtractError) {
      throw lastExtractError;
    }

    const jsonAttendance = parseAttendanceRowsFromJsonPayloads(jsonPayloads);
    const jsonTimetable = parseTimetableRowsFromJsonPayloads(jsonPayloads);
    const jsonMarks = parseMarksRowsFromJsonPayloads(jsonPayloads, [...bestTimetableRows, ...jsonTimetable]);
    const mergedAttendance = normalizeAttendanceRows([...(bestExtract.attendance || []), ...jsonAttendance]);
    const mergedDaily = normalizeDailyEntries(bestExtract.attendanceDaily || []);
    const mergedTimetable = dedupeTimetableRows([...bestTimetableRows, ...jsonTimetable]);
    const mergedMarks = dedupeMarksRows([...bestMarksRows, ...jsonMarks]);

    const result = {
      // Attendance page is the most stable source; we also try alternate SRM pages + JSON payloads.
      timetable: mergedTimetable,
      marks: mergedMarks,
      attendance: mergedAttendance,
      attendanceDaily: mergedDaily,
      attendanceVersion: computeAttendanceVersion(mergedAttendance),
      sourceUrl: bestExtract.sourceUrl
    };

    if (!result.attendance.length && !result.timetable.length && !result.marks.length) {
      // Include a hint for the most common cause: data is rendered inside a nested iframe/div grid.
      const bodyText = String(await page.textContent("body").catch(() => "")).toLowerCase();
      if (bodyText.includes("upgrade to creator") || bodyText.includes("creator 5")) {
        throw new Error("Academia portal content blocked by an overlay (Creator upgrade prompt). Use One-time Login, dismiss prompts, then Sync again.");
      }
      throw new Error("Academia scrape returned no readable rows. The portal may be rendering data in a non-table layout or requires a fresh login; try One-time Login then Sync.");
    }

    return result;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function scrapeAcademiaData({ collegeEmail, collegePassword, storageStatePath = null, storageState = null }) {
  const mode = String(process.env.ACADEMIA_SCRAPE_MODE || "").toLowerCase();
  const attempts = Math.max(1, Number(process.env.ACADEMIA_RETRY_ATTEMPTS || 3));
  const backoffMs = Math.max(300, Number(process.env.ACADEMIA_RETRY_BACKOFF_MS || 1200));
  const usesHashPages =
    String(process.env.ACADEMIA_TIMETABLE_URL || "").includes("#Page:")
    || String(process.env.ACADEMIA_MARKS_URL || "").includes("#Page:")
    || String(process.env.ACADEMIA_ATTENDANCE_URL || "").includes("#Page:");

  if (mode === "playwright" || usesHashPages) {
    try {
      return await withRetry(
        () => scrapeAcademiaDataWithPlaywright({ collegeEmail, collegePassword, storageStatePath, storageState }),
        { attempts, backoffMs }
      );
    } catch (error) {
      if (isFatalScrapeError(error)) {
        const detail = String(error?.message || "unknown playwright error");
        throw new Error(`Academia scraping failed after ${attempts} attempts (playwright): ${detail}`);
      }

      const playwrightMsg = String(error?.message || "").toLowerCase();
      if (playwrightMsg.includes("no readable rows") || playwrightMsg.includes("content blocked by an overlay") || playwrightMsg.includes("try one-time login")) {
        // HTTP fallback won't help when the SPA rendered but our selectors/parsers couldn't extract rows.
        const detail = String(error?.message || "unknown playwright error");
        throw new Error(`Academia scraping failed after ${attempts} attempts (playwright): ${detail}`);
      }

      try {
        return await withRetry(
          () => scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword }),
          { attempts, backoffMs }
        );
      } catch (httpError) {
        const playwrightDetail = String(error?.message || "unknown playwright error");
        const httpDetail = String(httpError?.message || "unknown HTTP scrape error");
        throw new Error(
          `Academia scraping failed after ${attempts} attempts (playwright+http fallback): ${playwrightDetail}; fallback: ${httpDetail}`
        );
      }
    }
  }

  try {
    return await withRetry(
      () => scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword }),
      { attempts, backoffMs }
    );
  } catch (error) {
    const detail = String(error?.message || "unknown HTTP scrape error");
    throw new Error(`Academia scraping failed after ${attempts} attempts (http): ${detail}`);
  }
}

async function captureAcademiaStorageState({ collegeEmail, collegePassword, outputPath }) {
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `cd gak-backend && npm i playwright` to enable SRM Academia scraping.");
  }

  const email = String(collegeEmail || "").trim().toLowerCase();
  const password = String(collegePassword || "");
  if (!email || !password) {
    throw new Error("Academia capture requires collegeEmail and collegePassword");
  }

  const out = String(outputPath || "").trim()
    || path.join(process.cwd(), "tmp", "academia_storage_state.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const baseUrl = process.env.ACADEMIA_BASE_URL || "https://academia.srmist.edu.in";
  const signinUrl = String(process.env.ACADEMIA_SIGNIN_URL || baseUrl).trim();
  const timeoutMs = Math.max(60_000, Number(process.env.ACADEMIA_CAPTURE_TIMEOUT_MS || 5 * 60 * 1000));

  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(signinUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1200);

    let targets = await resolveZohoLoginTargets(page);

    // Prefill login details, then let user solve captcha if it appears.
    const emailOk = await fillOnAnyTarget(
      targets,
      ["#login_id", "input[name='login_id']", "input[name='LOGIN_ID']", "input[name='username']", "input[type='email']"],
      email,
      8000
    );
    if (emailOk) {
      await clickOnAnyTarget(targets, ["#nextbtn", "button:has-text('Next')", "button:has-text('Continue')", "button:has-text('Sign in')"], 8000);
      await page.waitForTimeout(1200);
    }

    targets = await resolveZohoLoginTargets(page);
    const passwordOk = await fillOnAnyTarget(
      targets,
      ["#password", "input[name='password']", "input[name='PASSWORD']", "input[type='password']"],
      password,
      8000
    );
    if (passwordOk) {
      await clickOnAnyTarget(targets, ["#nextbtn", "button:has-text('Sign in')", "button:has-text('Sign In')", "button:has-text('Login')"], 8000);
      await page.waitForTimeout(1200);
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await pageHasSessionLimitExceeded(page)) {
        const resolved = await maybeResolveSessionLimitExceeded(page);
        if (!resolved) {
          throw new Error(
            "Session limit exceeded. Sign out of SRM/Zoho elsewhere or enable ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT=true and retry."
          );
        }
        await page.waitForTimeout(2500);
      }

      const targetsNow = await resolveZohoLoginTargets(page);
      if (await anyTargetHasInvalidCredentials(targetsNow)) {
        throw new Error("Academia login failed: invalid college credentials");
      }

      const bodyText = String(await page.textContent("body").catch(() => "")).toLowerCase();
      const portalLike =
        bodyText.includes("quick access")
        || bodyText.includes("welcome")
        || bodyText.includes("student profile")
        || bodyText.includes("academic reports unified");
      const hasLoginIframe = (await page.locator("iframe#signinFrame, iframe[name='zohoiam'], iframe[src*='/accounts/p/']").count().catch(() => 0)) > 0;

      // If captcha is shown, user must solve it; we just keep waiting.
      if (portalLike && !hasLoginIframe) {
        await context.storageState({ path: out });
        return { saved: true, outputPath: out };
      }

      await page.waitForTimeout(1500);
    }

    throw new Error("Timed out waiting for SRM portal login. Try again and complete captcha/session prompts in the opened window.");
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

module.exports = {
  scrapeAcademiaData,
  captureAcademiaStorageState,
  // Internal helpers for local debugging/smoke tests (not used by app routes).
  __debug: {
    parseTimetableRows,
    parseTimetableRowsFromText,
    parseMarksRows,
    parseMarksRowsFromText,
    parseAttendanceRows,
    parseAttendanceRowsFromText,
    parseAttendanceDailyEntries,
    parseAndNormalizeAttendance,
    parseAttendanceRowsFromJsonPayloads,
    parseTimetableRowsFromJsonPayloads,
    computeAttendanceVersion,
    parseRowsFromHtmlTables,
    cleanText
  }
};

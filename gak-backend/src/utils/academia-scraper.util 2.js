const { createHash } = require("crypto");
const { createId } = require("./id.util");
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

function isMfaBlockEnabled() {
  return String(process.env.ACADEMIA_ENFORCE_MFA_BLOCK || "false").toLowerCase().trim() === "true";
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

function isTransientNavigationError(error) {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("err_network_changed")
    || text.includes("err_internet_disconnected")
    || text.includes("err_timed_out")
    || text.includes("err_name_not_resolved")
    || text.includes("timeout")
    || text.includes("navigation")
    || text.includes("net::")
  );
}

async function gotoWithRetry(page, url, options = {}, { attempts = 3, backoffMs = 700 } = {}) {
  const targetUrl = String(url || "");
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await page.goto(targetUrl, options);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientNavigationError(error)) {
        throw error;
      }
      await sleep(backoffMs * attempt);
    }
  }
  throw lastError;
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

function parseTableRowsFromHtml(html, { preserveEmptyCells = false } = {}) {
  const tables = [...String(html || "").matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const out = [];

  for (const table of tables) {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
    const tableRows = [];
    for (const row of rows) {
      const rawCells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => cleanText(m[1]));
      const cells = preserveEmptyCells ? rawCells : rawCells.filter(Boolean);
      if (cells.length) {
        tableRows.push(cells);
      }
    }
    if (tableRows.length) {
      out.push(tableRows);
    }
  }

  return out;
}

function parseRowsFromHtmlTables(html) {
  return parseTableRowsFromHtml(html).flat();
}

function discoverTimetableHashUrls({ html = "", text = "", baseUrl = "" } = {}) {
  const discovered = new Set();
  const sources = [String(html || ""), String(text || "")];
  const keepRoute = (route) => {
    const value = String(route || "").toLowerCase();
    if (!value.startsWith("#page:")) return false;
    return (
      value.includes("unified_time_table")
      || value.includes("my_time_table")
      || value.includes("academic_reports")
      || value.includes("academic_calendar")
      || value.includes("day_order")
    );
  };
  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");

  for (const source of sources) {
    if (!source) continue;
    const fullUrls = source.match(/https?:\/\/[^\s"'<>]+#Page:[A-Za-z0-9_]+/gi) || [];
    for (const full of fullUrls) {
      try {
        const parsed = new URL(full);
        if (!/academia\.srmist\.edu\.in$/i.test(parsed.hostname)) continue;
        if (!keepRoute(parsed.hash)) continue;
        discovered.add(`${parsed.origin}/${parsed.hash}`.replace(/\/+#/, "/#"));
      } catch (_error) {
        // ignore malformed URLs in scraped text/html
      }
    }

    const hashRoutes = source.match(/#Page:[A-Za-z0-9_]+/gi) || [];
    for (const hash of hashRoutes) {
      if (!keepRoute(hash)) continue;
      if (normalizedBase) {
        discovered.add(`${normalizedBase}/${hash}`.replace(/\/+#/, "/#"));
      } else {
        discovered.add(hash);
      }
    }
  }

  return [...discovered];
}

function discoverMarksHashUrls({ html = "", text = "", baseUrl = "" } = {}) {
  const discovered = new Set();
  const sources = [String(html || ""), String(text || "")];
  const keepRoute = (route) => {
    const value = String(route || "").toLowerCase();
    if (!value.startsWith("#page:")) return false;
    return value.includes("marks");
  };
  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");

  for (const source of sources) {
    if (!source) continue;
    const fullUrls = source.match(/https?:\/\/[^\s"'<>]+#Page:[A-Za-z0-9_]+/gi) || [];
    for (const full of fullUrls) {
      try {
        const parsed = new URL(full);
        if (!/academia\.srmist\.edu\.in$/i.test(parsed.hostname)) continue;
        if (!keepRoute(parsed.hash)) continue;
        discovered.add(`${parsed.origin}/${parsed.hash}`.replace(/\/+#/, "/#"));
      } catch (_error) {
        // ignore malformed URLs in scraped text/html
      }
    }

    const hashRoutes = source.match(/#Page:[A-Za-z0-9_]+/gi) || [];
    for (const hash of hashRoutes) {
      if (!keepRoute(hash)) continue;
      if (normalizedBase) {
        discovered.add(`${normalizedBase}/${hash}`.replace(/\/+#/, "/#"));
      } else {
        discovered.add(hash);
      }
    }
  }

  return [...discovered];
}

function extractBatchNumber(value) {
  const text = String(value || "");
  if (!text) return null;
  const byRoute = text.match(/batch[_\-\s]?(\d{1,2})/i);
  if (byRoute) {
    const n = Number(byRoute[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  const byLabel = text.match(/\bbatch\s*(\d{1,2})\b/i);
  if (byLabel) {
    const n = Number(byLabel[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

function resolveAcademiaRouteUrl(configuredValue, fallbackUrl) {
  const configured = String(configuredValue || "").trim();
  const fallback = String(fallbackUrl || "").trim();
  if (!configured) return fallback;
  if (!fallback) return configured;
  if (/#page:/i.test(configured)) return configured;

  try {
    const cfg = new URL(configured);
    const fb = new URL(fallback);
    const sameOrigin = cfg.origin === fb.origin;
    const hasExplicitPath = Boolean(cfg.pathname && cfg.pathname !== "/");
    const hasPageHash = Boolean(cfg.hash && /#page:/i.test(cfg.hash));
    // Unquoted .env values like ".../#Page:My_Marks" get truncated at '#'
    // by dotenv and become just origin/root. In that case, use fallback.
    if (sameOrigin && !hasExplicitPath && !hasPageHash) {
      return fallback;
    }
  } catch (_error) {
    // Keep configured value if URL parsing fails.
  }

  return configured;
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
  const normalizedTitlesByCode = new Map();
  const firstTitleByCode = new Map();
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
      if (!normalizedTitlesByCode.has(code)) normalizedTitlesByCode.set(code, new Set());
      normalizedTitlesByCode.get(code).add(title.toLowerCase());
      if (!firstTitleByCode.has(code)) firstTitleByCode.set(code, title);
    }
  }

  for (const [code, titles] of normalizedTitlesByCode.entries()) {
    if (titles.size === 1) {
      map.set(code, firstTitleByCode.get(code));
    }
  }

  return map;
}

function normalizeHeaderLabel(value) {
  return cleanText(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderIndex(normalizedHeaders, patterns) {
  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    const cell = normalizedHeaders[i];
    if (patterns.some((re) => re.test(cell))) {
      return i;
    }
  }
  return -1;
}

function isAbsentToken(value) {
  const normalized = cleanText(value || "").toLowerCase();
  if (!normalized) return true;
  return /^(ab|absent|na|n\/a|null|nil|--|-)$/.test(normalized);
}

function parseNumberSafe(value) {
  const text = cleanText(value || "");
  if (!text || isAbsentToken(text)) return null;
  const m = text.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseHeaderMaxScore(headerText) {
  const text = normalizeHeaderLabel(headerText);
  const byOutOf = text.match(/out\s*of\s*(\d+(?:\.\d+)?)/i);
  if (byOutOf) return Number(byOutOf[1]);
  const byBrackets = text.match(/[\[(\/]\s*(\d+(?:\.\d+)?)\s*[\])]?$/i);
  if (byBrackets) return Number(byBrackets[1]);
  const byMarks = text.match(/(\d+(?:\.\d+)?)\s*marks?/i);
  if (byMarks) return Number(byMarks[1]);
  return null;
}

function parseMarksRowsFromDynamicHeaders(tables) {
  const parsed = [];

  for (const tableRows of tables || []) {
    if (!Array.isArray(tableRows) || tableRows.length < 2) continue;

    for (let headerAt = 0; headerAt < tableRows.length; headerAt += 1) {
      const headerCells = tableRows[headerAt] || [];
      const normalizedHeaders = headerCells.map(normalizeHeaderLabel);
      if (!normalizedHeaders.length) continue;

      const idxSubjectCode = findHeaderIndex(normalizedHeaders, [/\bcourse code\b/, /\bsubject code\b/, /^code$/]);
      const idxSubjectName = findHeaderIndex(normalizedHeaders, [/\bcourse title\b/, /\bcourse name\b/, /\bsubject name\b/, /^subject$/]);
      const idxExamType = findHeaderIndex(normalizedHeaders, [/\bexam type\b/, /\bassessment type\b/, /\bcomponent\b/, /\btest type\b/]);
      const idxTestPerformance = findHeaderIndex(normalizedHeaders, [/\btest performance\b/, /\bperformance\b/, /\bmarks detail\b/, /\bscore detail\b/]);
      const idxInternal = findHeaderIndex(normalizedHeaders, [/\binternal\b/, /\bcia\b/, /\bcat\b/, /\bsessional\b/]);
      const idxExternal = findHeaderIndex(normalizedHeaders, [/\bexternal\b/, /\bend ?sem\b/, /\bese\b/]);
      const idxTotal = findHeaderIndex(normalizedHeaders, [/\btotal\b/, /\boverall\b/, /\baggregate\b/]);
      const idxGrade = findHeaderIndex(normalizedHeaders, [/\bgrade\b/]);
      const idxCredits = findHeaderIndex(normalizedHeaders, [/\bcredits?\b/]);

      const hasSubject = idxSubjectCode >= 0 || idxSubjectName >= 0;
      const hasMarksColumns = [idxTestPerformance, idxInternal, idxExternal, idxTotal, idxGrade, idxCredits].some((idx) => idx >= 0);
      if (!hasSubject || !hasMarksColumns) continue;

      const maxByIndex = new Map();
      for (let idx = 0; idx < headerCells.length; idx += 1) {
        const max = parseHeaderMaxScore(headerCells[idx]);
        if (Number.isFinite(max) && max > 0) {
          maxByIndex.set(idx, Number(max));
        }
      }

      for (const cells of tableRows.slice(headerAt + 1)) {
        if (!Array.isArray(cells) || cells.length === 0) continue;
        const rowText = cleanText(cells.join(" "));
        if (!rowText) continue;
        if (/course code|course title|subject code|subject name|test performance|hours conducted|hours absent|attn/i.test(rowText)) continue;

        const subjectCodeRaw = idxSubjectCode >= 0 ? cleanText(cells[idxSubjectCode] || "") : "";
        const subjectCode = isCourseCodeLike(subjectCodeRaw) ? normalizeCourseCode(subjectCodeRaw) : "";
        const subjectNameRaw = idxSubjectName >= 0 ? cleanText(cells[idxSubjectName] || "") : "";
        const subjectName = subjectNameRaw || subjectCode || "";
        if (!subjectName) continue;

        const examType = idxExamType >= 0 ? cleanText(cells[idxExamType] || "").slice(0, 255) : "";
        const grade = idxGrade >= 0 ? cleanText(cells[idxGrade] || "").toUpperCase().slice(0, 20) : "";
        const credits = idxCredits >= 0 ? parseNumberSafe(cells[idxCredits]) : null;

        const pushComponent = (componentName, score, maxScore) => {
          if (!componentName || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return;
          if (score < 0 || score > maxScore) return;
          parsed.push({
            id: createId("acad"),
            subjectName: subjectCode || subjectName,
            componentName: cleanText(componentName).slice(0, 255),
            score,
            maxScore,
            percentage: Number(((score / maxScore) * 100).toFixed(2)),
            subjectCode: subjectCode || null,
            examType: examType || null,
            grade: grade || null,
            credits
          });
        };

        if (idxTestPerformance >= 0) {
          const perf = cleanText(cells[idxTestPerformance] || "");
          const matches = [...perf.matchAll(/([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g)];
          for (const m of matches) {
            const componentName = cleanText(m[1] || "");
            const maxScore = Number(m[2]);
            const score = Number(m[3]);
            pushComponent(componentName, score, maxScore);
          }
        }

        const numericColumns = [
          { idx: idxInternal, name: "internal" },
          { idx: idxExternal, name: "external" },
          { idx: idxTotal, name: "total" }
        ];
        for (const column of numericColumns) {
          if (column.idx < 0) continue;
          const score = parseNumberSafe(cells[column.idx]);
          const maxScore = Number(maxByIndex.get(column.idx) || NaN);
          if (score === null || !Number.isFinite(maxScore) || maxScore <= 0) continue;
          pushComponent(examType || column.name, score, maxScore);
        }
      }
    }
  }

  return dedupeMarksRows(parsed);
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

function parseDateLoose(value) {
  const text = cleanText(value || "");
  if (!text) return null;

  const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) {
    let dd = Number(dmy[1]);
    let mm = Number(dmy[2]);
    let yy = Number(dmy[3]);
    if (yy < 100) yy += 2000;
    if (yy >= 2000 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  const ymd = text.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (ymd) {
    const yy = Number(ymd[1]);
    const mm = Number(ymd[2]);
    const dd = Number(ymd[3]);
    if (yy >= 2000 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  const dayMonthYear = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);
  if (dayMonthYear) {
    const dd = Number(dayMonthYear[1]);
    const mm = MONTH_NAME_MAP[String(dayMonthYear[2] || "").toLowerCase()] || 0;
    let yy = Number(dayMonthYear[3]);
    if (yy < 100) yy += 2000;
    if (yy >= 2000 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  return null;
}

function inferAcademicEventType(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "event";
  if (text.includes("holiday") || text.includes("vacation")) return "holiday";
  if (text.includes("exam") || text.includes("assessment") || text.includes("test")) return "exam";
  if (text.includes("day order")) return "day_order";
  if (text.includes("working")) return "working_day";
  return "event";
}

const MONTH_NAME_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function parsePlannerMonthHeader(value) {
  const text = cleanText(value || "");
  if (!text) return null;
  const m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b(?:\s*['’]?\s*(\d{2,4}))?/i);
  if (!m) return null;
  const month = MONTH_NAME_MAP[String(m[1] || "").toLowerCase()] || null;
  if (!month) return null;

  const yearToken = String(m[2] || "").trim();
  if (!yearToken) return null;
  let year = Number(yearToken);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100) return null;
  return { month, year };
}

function parsePlannerDayOrderValue(value) {
  const text = cleanText(value || "");
  if (!text) return null;
  if (/^(?:-|--|—|–|na|n\/a)$/i.test(text)) return null;
  const match = text.match(/\b([1-7])\b/);
  if (!match) return parseDayOrder(text);
  const day = Number(match[1]);
  return Number.isFinite(day) && day >= 1 && day <= 7 ? day : null;
}

function parseAcademicPlannerRowsFromTable(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  let headerAt = -1;
  let groups = [];
  for (let r = 0; r < rows.length; r += 1) {
    const cells = Array.isArray(rows[r]) ? rows[r] : [];
    if (cells.length < 4) continue;
    const found = [];
    for (let i = 0; i <= cells.length - 4; i += 1) {
      const c0 = normalizeHeaderLabel(cells[i]);
      const c1 = normalizeHeaderLabel(cells[i + 1]);
      const c3 = normalizeHeaderLabel(cells[i + 3]);
      const monthMeta = parsePlannerMonthHeader(cells[i + 2]);
      if (!monthMeta) continue;
      if (c0 !== "dt" || c1 !== "day") continue;
      if (!(c3 === "do" || c3 === "d.o" || c3 === "day order" || c3 === "dayorder")) continue;
      found.push({
        dtIndex: i,
        dayIndex: i + 1,
        descIndex: i + 2,
        doIndex: i + 3,
        month: monthMeta.month,
        year: monthMeta.year
      });
      i += 3;
    }
    if (found.length > 0) {
      headerAt = r;
      groups = found;
      break;
    }
  }

  if (headerAt < 0 || !groups.length) return [];

  const out = [];
  for (const cells of rows.slice(headerAt + 1)) {
    if (!Array.isArray(cells) || !cells.length) continue;
    for (const group of groups) {
      if (group.dtIndex >= cells.length) continue;
      const dtText = cleanText(cells[group.dtIndex] || "");
      const dayText = cleanText(cells[group.dayIndex] || "");
      const descText = cleanText(cells[group.descIndex] || "");
      const doText = cleanText(cells[group.doIndex] || "");
      const dtMatch = dtText.match(/\b(\d{1,2})\b/);
      if (!dtMatch) continue;
      const dayOfMonth = Number(dtMatch[1]);
      if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) continue;

      const date = `${group.year}-${String(group.month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
      const dayOrder = parsePlannerDayOrderValue(doText);

      let description = descText;
      if (!description || /^(?:-|--|—|–|na|n\/a)$/i.test(description)) {
        description = dayOrder ? `Day Order ${dayOrder}` : "";
      } else if (dayText && !description.toLowerCase().includes(dayText.toLowerCase())) {
        description = `${dayText} - ${description}`;
      }
      if (!description && dayOrder === null) continue;

      out.push({
        id: createId("acad"),
        date,
        dayOrder,
        eventType: inferAcademicEventType(description || (dayOrder ? "day order" : "event")),
        description: description.slice(0, 255)
      });
    }
  }

  return out;
}

function isPlannerCarryoverNoise(row) {
  const desc = cleanText(row?.description || "").toLowerCase();
  if (!desc) return false;
  if (/^[1-7]$/.test(desc)) return true;
  if (/^(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\s*-\s*[1-7]$/.test(desc)) {
    return true;
  }
  return false;
}

function dedupeAcademicCalendarRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const date = String(row?.date || "").slice(0, 10);
    if (!date) continue;
    const dayOrderNum = Number(row?.dayOrder);
    const dayOrder = Number.isFinite(dayOrderNum) && dayOrderNum >= 1 && dayOrderNum <= 7 ? Math.round(dayOrderNum) : null;
    const eventType = cleanText(row?.eventType || "event").slice(0, 255) || "event";
    const description = cleanText(row?.description || "").slice(0, 255);
    const key = [date, dayOrder || "", eventType.toLowerCase(), description.toLowerCase()].join("|");
    if (map.has(key)) continue;
    map.set(key, {
      id: row?.id || createId("acad"),
      date,
      dayOrder,
      eventType,
      description
    });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || Number(a.dayOrder || 99) - Number(b.dayOrder || 99));
}

function parseAcademicCalendarRowsFromHtml(html) {
  const tableRows = parseTableRowsFromHtml(html, { preserveEmptyCells: true });
  const rows = parseRowsFromHtmlTables(html);
  const out = [];
  for (const cells of rows) {
    if (!Array.isArray(cells) || cells.length === 0) continue;
    const joined = cells.join(" ").trim();
    const date = parseDateLoose(joined) || cells.map((c) => parseDateLoose(c)).find(Boolean) || null;
    if (!date) continue;
    const dayOrder = parseDayOrder(joined);
    const description = cleanText(joined).slice(0, 255);
    if (!description) continue;
    out.push({
      id: createId("acad"),
      date,
      dayOrder,
      eventType: inferAcademicEventType(description),
      description
    });
  }
  const plannerRows = [];
  for (const table of tableRows) {
    plannerRows.push(...parseAcademicPlannerRowsFromTable(table));
  }
  if (plannerRows.length > 0) {
    const explicitDayOrderKeys = new Set(
      plannerRows
        .map((row) => {
          const day = Number(row?.dayOrder);
          if (!Number.isFinite(day) || day < 1 || day > 7) return null;
          return `${String(row?.date || "").slice(0, 10)}|${Math.round(day)}`;
        })
        .filter(Boolean)
    );
    const filteredGeneric = out.filter((row) => {
      if (!isPlannerCarryoverNoise(row)) return true;
      const day = Number(row?.dayOrder);
      if (!Number.isFinite(day) || day < 1 || day > 7) return false;
      return !explicitDayOrderKeys.has(`${String(row?.date || "").slice(0, 10)}|${Math.round(day)}`);
    });
    return dedupeAcademicCalendarRows([...filteredGeneric, ...plannerRows]);
  }
  return dedupeAcademicCalendarRows(out);
}

function parseAcademicCalendarRowsFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const date = parseDateLoose(line);
    if (!date) continue;
    const description = cleanText(line).slice(0, 255);
    if (!description) continue;
    out.push({
      id: createId("acad"),
      date,
      dayOrder: parseDayOrder(line),
      eventType: inferAcademicEventType(line),
      description
    });
  }
  return dedupeAcademicCalendarRows(out);
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

function normalizeSlotLookupToken(value) {
  const raw = String(value || "").toUpperCase().replace(/\s+/g, "").trim();
  if (!raw) return null;
  const withoutX = raw.replace(/\/X/g, "");
  const tokens = withoutX.match(/P\d{1,3}|L\d{1,3}|LAB\d{0,3}|[A-Z]\d?/g) || [];
  for (const token of tokens) {
    if (token === "X") continue;
    return token;
  }
  return null;
}

function extractSlotLookupTokens(value) {
  const raw = String(value || "").toUpperCase().replace(/\s+/g, "").trim();
  if (!raw) return [];
  const withoutX = raw.replace(/\/X/g, "");
  const tokens = withoutX.match(/P\d{1,3}|L\d{1,3}|LAB\d{0,3}|[A-Z]\d?/g) || [];
  const out = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!token || token === "X" || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function parseUnifiedTimeGridTemplateFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const lower = (value) => String(value || "").trim().toLowerCase();
  const timeRangeRegex = /(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/i;
  const parseTimeMinutes = (value) => {
    const m = String(value || "").match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return (hh * 60) + mm;
  };
  const formatTimeMinutes = (minutes) => {
    const mins = Math.max(0, Math.min((24 * 60) - 1, Number(minutes)));
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  };

  const hourRowIdx = rows.findIndex((cells) => {
    const first = lower(cells?.[0]);
    const hasHourHeader = first.includes("hour/day") || first.includes("hour day");
    const hasPeriods = (cells || []).some((c) => /^\d{1,2}$/.test(String(c || "").trim()));
    return hasHourHeader && hasPeriods;
  });
  if (hourRowIdx < 0) return [];

  const hourRow = rows[hourRowIdx] || [];
  const slotColumns = [];
  for (let i = 1; i < hourRow.length; i += 1) {
    if (/^\d{1,2}$/.test(String(hourRow[i] || "").trim())) {
      slotColumns.push(i);
    }
  }
  if (!slotColumns.length) return [];

  const headerRows = [];
  if (hourRowIdx - 2 >= 0) headerRows.push(rows[hourRowIdx - 2]);
  if (hourRowIdx - 1 >= 0) headerRows.push(rows[hourRowIdx - 1]);
  const timeByColumn = new Map();
  for (const colIdx of slotColumns) {
    for (const header of headerRows) {
      if (!Array.isArray(header) || colIdx >= header.length) continue;
      const text = String(header[colIdx] || "");
      if (!timeRangeRegex.test(text)) continue;
      const { startTime, endTime } = parseTimeRange(text);
      if (startTime && endTime) {
        timeByColumn.set(colIdx, { startTime, endTime });
        break;
      }
    }
  }

  // Unified tables render afternoon slots as 01:25/02:20... without AM/PM.
  // Normalize slot times to a monotonic daytime sequence in 24-hour format.
  let previousStartMinutes = null;
  for (const colIdx of slotColumns) {
    const range = timeByColumn.get(colIdx);
    if (!range) continue;
    let startMinutes = parseTimeMinutes(range.startTime);
    let endMinutes = parseTimeMinutes(range.endTime);
    if (startMinutes === null || endMinutes === null) continue;

    if (previousStartMinutes !== null) {
      while (startMinutes <= previousStartMinutes - 120) {
        startMinutes += 12 * 60;
        endMinutes += 12 * 60;
      }
    }
    if (endMinutes <= startMinutes) {
      endMinutes += 12 * 60;
    }

    if (startMinutes >= 24 * 60 || endMinutes > 24 * 60) {
      // Avoid impossible overflows if source headers are malformed.
      startMinutes = Math.min(startMinutes, (24 * 60) - 1);
      endMinutes = Math.min(Math.max(startMinutes + 1, endMinutes), 24 * 60);
    }

    previousStartMinutes = startMinutes;
    timeByColumn.set(colIdx, {
      startTime: formatTimeMinutes(startMinutes),
      endTime: formatTimeMinutes(Math.min(endMinutes, (24 * 60) - 1))
    });
  }

  const template = [];
  for (const cells of rows.slice(hourRowIdx + 1)) {
    if (!Array.isArray(cells) || !cells.length) continue;
    const dayLabel = String(cells[0] || "").trim();
    const dayOrder = parseDayOrder(dayLabel);
    if (!dayOrder) continue;

    for (const colIdx of slotColumns) {
      if (colIdx >= cells.length) continue;
      const slotToken = normalizeSlotLookupToken(cells[colIdx]);
      if (!slotToken) continue;
      const range = timeByColumn.get(colIdx) || null;
      template.push({
        dayOrder,
        dayLabel: `Day ${dayOrder}`,
        slotToken,
        startTime: range?.startTime || null,
        endTime: range?.endTime || null
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const row of template) {
    const key = [row.dayOrder, row.slotToken, row.startTime || "", row.endTime || ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

function parseUnifiedTimeGridTemplate(html) {
  return parseUnifiedTimeGridTemplateFromRows(parseRowsFromHtmlTables(html));
}

function hydrateTimetableWithUnifiedTemplate(subjectRows, templateRows) {
  if (!Array.isArray(subjectRows) || !subjectRows.length) return [];
  if (!Array.isArray(templateRows) || !templateRows.length) return dedupeTimetableRows(subjectRows);

  const templateBySlot = new Map();
  for (const row of templateRows) {
    const slot = normalizeSlotLookupToken(row?.slotToken);
    if (!slot) continue;
    const list = templateBySlot.get(slot) || [];
    list.push(row);
    templateBySlot.set(slot, list);
  }
  if (!templateBySlot.size) return dedupeTimetableRows(subjectRows);

  const mapped = [];
  const unmatched = [];
  for (const row of subjectRows) {
    const sourceSlot = row?.slot || row?.dayLabel || row?.day_label || "";
    const slots = extractSlotLookupTokens(sourceSlot);
    const candidates = [];
    for (const slot of slots) {
      const matches = templateBySlot.get(slot) || [];
      for (const match of matches) {
        candidates.push(match);
      }
    }
    if (!candidates.length) {
      unmatched.push(row);
      continue;
    }
    for (const match of candidates) {
      mapped.push({
        id: row?.id || createId("acad"),
        dayOrder: match.dayOrder || row?.dayOrder || null,
        dayLabel: match.dayLabel || row?.dayLabel || row?.day_label || null,
        startTime: match.startTime || row?.startTime || row?.start_time || null,
        endTime: match.endTime || row?.endTime || row?.end_time || null,
        subjectName: row?.subjectName || row?.subject_name,
        facultyName: row?.facultyName || row?.faculty_name || null,
        roomLabel: row?.roomLabel || row?.room_label || null,
        slot: slots[0] || row?.slot || null
      });
    }
  }

  return dedupeTimetableRows([...mapped, ...unmatched]);
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
    if (!dayLabel) {
      continue;
    }
    const dayOrder = parseDayOrder(dayLabel || "");
    const rangeCell = cells.find((c) => /(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})/i.test(c)) || "";
    const { startTime, endTime } = parseTimeRange(rangeCell);

    const remaining = cells.filter((c) => c !== dayLabel && c !== rangeCell);
    const subjectName = remaining[0] || "";
    if (/^(from|to|hour\/day order)$/i.test(String(subjectName || "").trim())) {
      continue;
    }
    if (!subjectName) {
      continue;
    }

    parsed.push({
      id: createId("acad"),
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
      id: createId("acad"),
      dayOrder: null,
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
    const slotLike = cols.find((c) => /\b([A-Z]\d?|LAB|slot|P\d{1,3}|L\d{1,3})\b/i.test(c));
    if (!slotLike) continue;

    const subjectName = cleanText(cols[1] || cols[0] || "");
    if (!subjectName || /course code|course title|faculty/i.test(subjectName)) continue;

    const slotToken = normalizeSlotToken(slotLike);
    const explicitDayOrder = parseDayOrder(line) || null;
    const inferred = (slotToken && slotTimeHints.get(slotToken)) || (slotToken && DEFAULT_SLOT_TIMINGS[slotToken]) || null;

    parsed.push({
      id: createId("acad"),
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
  const tables = parseTableRowsFromHtml(html);
  const dynamicHeaderParsed = parseMarksRowsFromDynamicHeaders(tables);
  if (dynamicHeaderParsed.length > 0) {
    return dynamicHeaderParsed;
  }
  const rows = tables.flat();
  const lower = (value) => String(value || "").trim().toLowerCase();
  const parsedFromHeaderTables = [];

  for (const tableRows of tables) {
    const headerRow = tableRows.find((cells) => {
      const cols = cells.map(lower);
      return cols.includes("course code") && cols.some((c) => c.includes("test performance"));
    });
    if (!headerRow) continue;

    const parsedTestPerf = [];
    const headerCols = headerRow.map(lower);
    const idxCourse = headerCols.indexOf("course code");
    const idxPerf = headerCols.findIndex((c) => c.includes("test performance"));
    const idxCourseTitle = headerCols.findIndex((c) => c.includes("course title"));
    const headerAt = tableRows.indexOf(headerRow);
    const scopedCourseTitleByCode = idxCourseTitle >= 0 ? buildCourseTitleMap(tableRows) : new Map();
    const orderedCourseCodes = [];
    for (const cells of tableRows.slice(headerAt + 1)) {
      const courseCell = idxCourse >= 0 && idxCourse < cells.length ? cells[idxCourse] : "";
      const code = normalizeCourseCode(courseCell || "");
      if (isCourseCodeLike(code) && !orderedCourseCodes.includes(code)) {
        orderedCourseCodes.push(code);
      }
    }
    let nextCourseCursor = 0;
    let lastCourseCode = "";
    let lastComponentName = "";

    for (const cells of tableRows.slice(headerAt + 1)) {
      if (!Array.isArray(cells) || cells.length === 0) continue;
      const rawCourseCell = idxCourse >= 0 && idxCourse < cells.length ? cells[idxCourse] : "";
      const normalizedCourseCode = normalizeCourseCode(rawCourseCell || "");
      if (normalizedCourseCode && isCourseCodeLike(normalizedCourseCode)) {
        lastCourseCode = normalizedCourseCode;
        const idx = orderedCourseCodes.indexOf(normalizedCourseCode);
        if (idx >= 0) {
          nextCourseCursor = idx + 1;
        }
      }
      let courseCode = (normalizedCourseCode && isCourseCodeLike(normalizedCourseCode))
        ? normalizedCourseCode
        : lastCourseCode;
      const perfCell = idxPerf >= 0 && idxPerf < cells.length ? cells[idxPerf] : "";
      const perf = String(perfCell || cells[cells.length - 1] || "").trim();
      if (!perf) continue;

      // SRM sometimes renders compact continuation rows like "FT-I/5.00 3.80" without course code.
      // When the component repeats (e.g., FT-I across many rows), rows are often new subjects.
      // When component changes (e.g., FT-I -> FT-II), row is usually continuation for same subject.
      const standalonePerfOnlyMatch = perf.match(/^([A-Za-z0-9-]+)\s*\/\s*\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/);
      const standalonePerfOnly = Boolean(standalonePerfOnlyMatch);
      const standaloneComponent = cleanText(standalonePerfOnlyMatch?.[1] || "").toLowerCase();
      if (
        !(normalizedCourseCode && isCourseCodeLike(normalizedCourseCode))
        && standalonePerfOnly
        && nextCourseCursor < orderedCourseCodes.length
      ) {
        const repeatedComponent = Boolean(
          standaloneComponent
          && lastComponentName
          && standaloneComponent === String(lastComponentName).toLowerCase()
        );
        const shouldAdvanceCourse = Boolean(lastCourseCode && repeatedComponent);
        if (shouldAdvanceCourse) {
          courseCode = orderedCourseCodes[nextCourseCursor];
          lastCourseCode = courseCode;
          nextCourseCursor += 1;
        }
      }
      if (!courseCode) continue;

      let subjectName = courseCode;
      const inlineCourseTitle = idxCourseTitle >= 0 && idxCourseTitle < cells.length
        ? cleanText(cells[idxCourseTitle] || "").slice(0, 255)
        : "";
      if (inlineCourseTitle && !isCourseCodeLike(inlineCourseTitle)) {
        subjectName = inlineCourseTitle;
      } else if (scopedCourseTitleByCode.has(courseCode)) {
        subjectName = scopedCourseTitleByCode.get(courseCode) || courseCode;
      }

      const matches = [...perf.matchAll(/([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g)];
      if (matches.length > 0) {
        lastComponentName = cleanText(matches[0][1] || "").slice(0, 255);
      }
      for (const m of matches) {
        const componentName = String(m[1] || "").trim();
        const maxScore = Number(m[2]);
        const score = Number(m[3]);
        if (!componentName || !Number.isFinite(maxScore) || maxScore <= 0 || !Number.isFinite(score)) continue;
        parsedTestPerf.push({
          id: createId("acad"),
          subjectName,
          componentName,
          score,
          maxScore,
          percentage: Number(((score / maxScore) * 100).toFixed(2))
        });
      }
    }

    if (parsedTestPerf.length > 0) {
      parsedFromHeaderTables.push(...parsedTestPerf);
    }
  }

  if (parsedFromHeaderTables.length > 0) {
    return dedupeMarksRows(parsedFromHeaderTables);
  }

  const courseTitleByCode = buildCourseTitleMap(rows);

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
      id: createId("acad"),
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
  let pendingMaxScore = null;
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
      pendingMaxScore = null;
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
        id: createId("acad"),
        subjectName: (currentSubject || "Unknown Subject").slice(0, 255),
        componentName,
        score,
        maxScore,
        percentage: Number(((score / maxScore) * 100).toFixed(2))
      });
      pendingComponent = null;
      pendingMaxScore = null;
      continue;
    }

    // Example split over two lines:
    // line A: "FT-I/5.00"
    // line B: "2.50"
    const componentWithMaxOnly = line.match(/^([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (componentWithMaxOnly) {
      pendingComponent = cleanText(componentWithMaxOnly[1]).slice(0, 255);
      pendingMaxScore = Number(componentWithMaxOnly[2]);
      continue;
    }

    const scoreOnly = line.match(/^(\d+(?:\.\d+)?)$/);
    if (scoreOnly && Number.isFinite(pendingMaxScore) && pendingMaxScore > 0) {
      const score = Number(scoreOnly[1]);
      if (Number.isFinite(score) && score >= 0 && score <= pendingMaxScore) {
        parsed.push({
          id: createId("acad"),
          subjectName: (currentSubject || "Unknown Subject").slice(0, 255),
          componentName: cleanText(pendingComponent || "overall").slice(0, 255),
          score,
          maxScore: pendingMaxScore,
          percentage: Number(((score / pendingMaxScore) * 100).toFixed(2))
        });
      }
      pendingComponent = null;
      pendingMaxScore = null;
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
          id: createId("acad"),
          subjectName: (currentSubject || "Unknown Subject").slice(0, 255),
          componentName: inlineComponent,
          score,
          maxScore,
          percentage: Number(((score / maxScore) * 100).toFixed(2))
        });
        pendingComponent = null;
        pendingMaxScore = null;
      }
      continue;
    }

    if (/^(ft|quiz|internal|assignment|assign|lab|practical|mid|end|cie|cat)[\w\s\-()]*$/i.test(line)) {
      pendingComponent = cleanText(line).slice(0, 255);
      pendingMaxScore = null;
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
      id: createId("acad"),
      subjectName: cells[0],
      courseCode: isCourseCodeLike(cells[0]) ? normalizeCourseCode(cells[0]) : null,
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
  const idxCode = headerCols.indexOf("course code");
  const idxTitle = headerCols.indexOf("course title");
  const idxConducted = headerCols.findIndex((c) => c.includes("hours conducted"));
  const idxAbsent = headerCols.findIndex((c) => c.includes("hours absent"));
  const idxPct = headerCols.findIndex((c) => c.includes("attn"));

  const headerAt = rows.indexOf(headerRow);
  for (const cells of rows.slice(headerAt + 1)) {
    if (cells.length <= Math.max(idxTitle, idxConducted, idxAbsent, idxPct, idxCode)) {
      continue;
    }

    const rawCode = idxCode >= 0 ? String(cells[idxCode] || "").trim() : "";
    const courseCode = isCourseCodeLike(rawCode) ? normalizeCourseCode(rawCode) : null;
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
      id: createId("acad"),
      subjectName,
      courseCode,
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
          id: createId("acad"),
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
          id: createId("acad"),
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
    const rawCourseCode = normalizeCourseCode(row?.courseCode || row?.course_code || "");
    const courseCode = isCourseCodeLike(rawCourseCode) ? rawCourseCode : null;
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
      id: row?.id || createId("acad"),
      subjectName,
      courseCode,
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
      } else if (!existing.courseCode && row.courseCode) {
        deduped[i] = { ...existing, courseCode: row.courseCode };
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
    id: createId("acad"),
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
    id: createId("acad"),
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
          id: createId("acad"),
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
        id: createId("acad"),
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

async function scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword, scrapeMode = "full" }) {
  const totalStartMs = Date.now();
  const baseUrl = process.env.ACADEMIA_BASE_URL || "https://academia.srmist.edu.in";
  const uriPrefix = process.env.ACADEMIA_ZOHO_URI_PREFIX || "/accounts/p/40-10002227248";
  const timetableUrl = resolveAcademiaRouteUrl(
    process.env.ACADEMIA_TIMETABLE_URL,
    `${baseUrl}/#Page:My_Time_Table`
  );
  const marksUrl = resolveAcademiaRouteUrl(
    process.env.ACADEMIA_MARKS_URL,
    `${baseUrl}/#Page:My_Marks`
  );
  const attendanceUrl = resolveAcademiaRouteUrl(
    process.env.ACADEMIA_ATTENDANCE_URL,
    `${baseUrl}/#Page:My_Attendance`
  );
  const mode = String(scrapeMode || "full").toLowerCase();
  const needsTimetable = mode !== "marks_attendance";
  const needsMarks = mode !== "reports";
  const needsAttendance = mode !== "reports";

  const loginStartMs = Date.now();
  const { cookieHeader } = await loginZohoIam({
    baseUrl,
    uriPrefix,
    collegeEmail: String(collegeEmail || "").trim().toLowerCase(),
    collegePassword: String(collegePassword || "")
  });
  const loginMs = Date.now() - loginStartMs;

  const pageFetchStartMs = Date.now();
  const [timetablePage, marksPage, attendancePage] = await Promise.all([
    needsTimetable ? fetchText(timetableUrl, { cookieHeader }) : Promise.resolve(null),
    needsMarks ? fetchText(marksUrl, { cookieHeader }) : Promise.resolve(null),
    needsAttendance ? fetchText(attendanceUrl, { cookieHeader }) : Promise.resolve(null)
  ]);
  const pageFetchMs = Date.now() - pageFetchStartMs;

  const pageFailures = [timetablePage, marksPage, attendancePage]
    .filter(Boolean)
    .some((page) => !page.ok);
  if (pageFailures) {
    throw new Error("Unable to fetch one or more academia pages. Verify page URLs in environment.");
  }

  const parseStartMs = Date.now();
  const timetableText = timetablePage ? htmlToTextLines(timetablePage.text).join("\n") : "";
  const marksText = marksPage ? htmlToTextLines(marksPage.text).join("\n") : "";
  const attendanceText = attendancePage ? htmlToTextLines(attendancePage.text).join("\n") : "";
  const calendarText = needsTimetable
    ? ((timetablePage ? htmlToTextLines(timetablePage.text).join("\n") : "") || (attendancePage ? htmlToTextLines(attendancePage.text).join("\n") : ""))
    : "";

  const timetableFromHtml = timetablePage ? parseTimetableRows(timetablePage.text) : [];
  const marksFromHtml = marksPage ? parseMarksRows(marksPage.text) : [];
  const academicCalendarFromHtml = needsTimetable
    ? dedupeAcademicCalendarRows([
      ...(timetablePage ? parseAcademicCalendarRowsFromHtml(timetablePage.text) : []),
      ...(attendancePage ? parseAcademicCalendarRowsFromHtml(attendancePage.text) : [])
    ])
    : [];
  const academicCalendarFromText = needsTimetable
    ? dedupeAcademicCalendarRows(parseAcademicCalendarRowsFromText(calendarText))
    : [];
  const attendanceParsed = attendancePage
    ? parseAndNormalizeAttendance({ html: attendancePage.text, text: attendanceText })
    : { attendance: [], dailyEntries: [], version: null };

  const timetable = needsTimetable
    ? (timetableFromHtml.length ? timetableFromHtml : parseTimetableRowsFromText(timetableText))
    : [];
  const marks = needsMarks
    ? dedupeMarksRows([...(marksFromHtml || []), ...parseMarksRowsFromText(marksText)])
    : [];
  const attendance = needsAttendance ? attendanceParsed.attendance : [];
  const academicCalendar = needsTimetable
    ? dedupeAcademicCalendarRows([...(academicCalendarFromHtml || []), ...(academicCalendarFromText || [])])
    : [];
  const batchNumber = needsTimetable
    ? extractBatchNumber(`${timetableUrl} ${timetableText}`)
    : null;
  const parseMs = Date.now() - parseStartMs;

  return {
    timetable,
    marks,
    attendance,
    academicCalendar,
    attendanceDaily: attendanceParsed.dailyEntries,
    attendanceVersion: attendanceParsed.version,
    sourceUrl: needsTimetable ? timetableUrl : attendanceUrl,
    batchNumber: Number.isFinite(batchNumber) ? batchNumber : null,
    timings: {
      loginMs,
      pageFetchMs,
      parseMs,
      totalMs: Date.now() - totalStartMs
    }
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
    const countVisible = async (locator) => {
      const count = await locator.count().catch(() => 0);
      let visible = 0;
      for (let i = 0; i < count; i += 1) {
        const isVisible = await locator.nth(i).isVisible().catch(() => false);
        if (isVisible) visible += 1;
      }
      return visible;
    };

    const bodyText = await getBodyText(target);
    const url = typeof target.url === "function" ? String(target.url() || "").toLowerCase() : "";
    const sessionLimitLike = (
      bodyText.includes("maximum concurrent sessions")
      || bodyText.includes("concurrent active sessions limit exceeded")
      || bodyText.includes("terminate all sessions")
      || bodyText.includes("skip for now")
    );
    if (sessionLimitLike) {
      return false;
    }
    const keywordHit = (
      bodyText.includes("one-time password")
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
    const otpFieldCount = await countVisible(
      target.locator(
        "input[name*='otp' i], input[id*='otp' i], input[name*='totp' i], input[id*='totp' i], input[name*='one_time' i], input[id*='one_time' i], input[name*='verification' i], input[id*='verification' i], input[autocomplete='one-time-code'], input[inputmode='numeric'][maxlength='6'], input[type='tel'][maxlength='6']"
      )
    );
    const verifyButtonCount = await countVisible(
      target.locator("button:has-text('Verify'), button:has-text('Submit code'), button:has-text('Continue')")
    );
    const passwordFieldCount = await countVisible(
      target.locator("input[type='password'], input[name='password'], #password")
    );
    const emailFieldCount = await countVisible(
      target.locator("input[type='email'], input[name='login_id'], #login_id")
    );

    // Avoid false positives from generic "verification" wording in non-MFA flows.
    // Consider MFA only when OTP input exists or when verification signals appear
    // while standard login inputs are absent.
    if (otpFieldCount > 0 && passwordFieldCount === 0) {
      return true;
    }
    return Boolean(
      keywordHit
      && urlHit
      && verifyButtonCount > 0
      && passwordFieldCount === 0
      && emailFieldCount === 0
      && bodyText.includes("otp")
    );
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

async function pageHasSessionLimitExceeded(target) {
  try {
    const url = typeof target.url === "function" ? String(target.url() || "").toLowerCase() : "";
    if (url.includes("block-sessions") || url.includes("terminate_session")) {
      return true;
    }
    const bodyText = await getBodyText(target);
    const hasSessionCopy = (
      bodyText.includes("maximum concurrent sessions")
      || bodyText.includes("concurrent active sessions limit exceeded")
      || bodyText.includes("concurrent sessions")
      || bodyText.includes("terminate all sessions")
      || bodyText.includes("terminate session")
      || bodyText.includes("skip for now")
    );
    if (!hasSessionCopy) {
      return false;
    }
    const hasActionButtons = await target
      .locator("#terminate_session_skip, #terminate_session_submit, button:has-text('Skip for now'), button:has-text('Terminate All Sessions')")
      .count()
      .catch(() => 0);
    return hasActionButtons > 0 || bodyText.includes("sessions");
  } catch (_error) {
    return false;
  }
}

async function anyTargetHasSessionLimitExceeded(targets) {
  for (const target of targets || []) {
    if (await pageHasSessionLimitExceeded(target)) {
      return true;
    }
  }
  return false;
}

async function maybeResolveSessionLimitExceeded(page) {
  const forceClickInTargets = async (targets, selectors) => {
    for (const target of targets || []) {
      try {
        const clicked = await target.evaluate((sels) => {
          const canClick = (el) => el && typeof el.click === "function";
          for (const sel of sels || []) {
            const nodes = Array.from(document.querySelectorAll(sel));
            for (const node of nodes) {
              const el = node;
              const style = window.getComputedStyle(el);
              const hidden = style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
              if (hidden) continue;
              if (canClick(el)) {
                el.click();
                return true;
              }
            }
          }
          return false;
        }, selectors).catch(() => false);
        if (clicked) {
          return true;
        }
      } catch (_error) {
        // continue
      }
    }
    return false;
  };

  // Prefer non-destructive session continuation first.
  // If "Skip for now" is unavailable, fall back to "Terminate all sessions".
  const targets = await resolveZohoLoginTargets(page);
  const skipped = await clickOnAnyTarget(
    targets,
    [
      "#terminate_session_skip",
      "input#terminate_session_skip",
      "[name='terminate_session_skip']",
      "button:has-text('Skip for now')",
      "button:has-text('Skip')",
      "button:has-text('Not now')",
      "button:has-text('Continue this session')",
      "a:has-text('Skip for now')"
    ],
    2500
  );
  const skippedForced = skipped
    || await forceClickInTargets(targets, [
      "#terminate_session_skip",
      "input#terminate_session_skip",
      "[name='terminate_session_skip']",
      "[id*='skip'][id*='session']",
      "[name*='skip'][name*='session']"
    ]);
  if (skippedForced) {
    await page.waitForTimeout(2000);
    return true;
  }

  // Some Zoho variants expose only generic continue controls on this interstitial.
  const continued = await clickOnAnyTarget(
    targets,
    [
      "button:has-text('Continue')",
      "button:has-text('Proceed')",
      "button:has-text('Continue this session')",
      "input[type='submit']",
      "button[type='submit']"
    ],
    2500
  );
  if (continued) {
    await page.waitForTimeout(2000);
    return true;
  }

  const terminatePolicy = String(process.env.ACADEMIA_TERMINATE_SESSIONS_ON_LIMIT || "auto").toLowerCase().trim();
  const allowTerminate = terminatePolicy !== "false" && terminatePolicy !== "off" && terminatePolicy !== "no";
  if (!allowTerminate) {
    return false;
  }

  // Last resort: terminate other sessions only when skip path is not available.
  const terminated = await clickOnAnyTarget(
    targets,
    [
      "#terminate_session_submit",
      "input#terminate_session_submit",
      "[name='terminate_session_submit']",
      "button:has-text('Terminate All Sessions')",
      "button:has-text('Terminate all sessions')",
      "a:has-text('Terminate All Sessions')"
    ],
    4000
  );
  const terminatedForced = terminated
    || await forceClickInTargets(targets, [
      "#terminate_session_submit",
      "input#terminate_session_submit",
      "[name='terminate_session_submit']",
      "[id*='terminate'][id*='session']",
      "[name*='terminate'][name*='session']"
    ]);
  if (!terminatedForced) {
    return false;
  }
  await page.waitForTimeout(3000);
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
  if (await anyTargetHasSessionLimitExceeded(targets)) {
    const resolved = await maybeResolveSessionLimitExceeded(page);
    if (resolved) {
      await page.waitForTimeout(2000);
      targets = await resolveZohoLoginTargets(page);
    }
  }

  if (await anyTargetHasCaptcha(targets)) {
    throw new Error(
      "Academia login blocked by captcha challenge. Complete login manually once and retry sync (use scripts/academia-capture-state.js to save a session state)."
    );
  }

  let passwordOk = await fillOnAnyTarget(
    targets,
    ["#password", "input[name='password']", "input[name='PASSWORD']", "input[type='password']"],
    collegePassword
  );
  if (!passwordOk) {
    // Some flows briefly show an interstitial before password input.
    await clickOnAnyTarget(
      targets,
      ["button:has-text('Continue')", "button:has-text('Proceed')", "button:has-text('Next')", "button:has-text('Not now')"],
      1200
    ).catch(() => undefined);
    await page.waitForTimeout(1200);
    targets = await resolveZohoLoginTargets(page);
    passwordOk = await fillOnAnyTarget(
      targets,
      ["#password", "input[name='password']", "input[name='PASSWORD']", "input[type='password']"],
      collegePassword
    );
  }
  if (!passwordOk) {
    if (await anyTargetHasCaptcha(targets)) {
      throw new Error(
        "Academia login blocked by captcha challenge. Complete login manually once and retry sync (use scripts/academia-capture-state.js to save a session state)."
      );
    }
    if (isMfaBlockEnabled() && await anyTargetHasMfa(targets)) {
      throw new Error("Academia login requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
    }
    throw new Error("Academia login failed: unable to find password input");
  }

  await clickOnAnyTarget(targets, ["#nextbtn", "button:has-text('Sign in')", "button:has-text('Sign In')", "button:has-text('Login')"]);

  // Wait until we land back on the academia app or a hash-page URL.
  await page.waitForTimeout(1500);
  targets = await resolveZohoLoginTargets(page);

  if (await anyTargetHasSessionLimitExceeded(targets)) {
    const resolved = await maybeResolveSessionLimitExceeded(page);
    if (!resolved) {
      // Last recovery attempt: go to app root and see if existing cookies are still accepted.
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      const postRecoveryTargets = await resolveZohoLoginTargets(page);
      const stillBlocked = await anyTargetHasSessionLimitExceeded(postRecoveryTargets);
      const hasLoginIframe = (await page.locator("iframe#signinFrame, iframe[name='zohoiam'], iframe[src*='/accounts/p/']").count().catch(() => 0)) > 0;
      if (stillBlocked || hasLoginIframe) {
        throw new Error(
          "Academia login blocked: maximum concurrent sessions limit exceeded. Sign out of SRM/Zoho on other devices and retry."
        );
      }
      targets = postRecoveryTargets;
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
      "Academia login blocked by captcha challenge. Complete login manually once and retry sync (use scripts/academia-capture-state.js to save a session state)."
    );
  }
  if (isMfaBlockEnabled() && await anyTargetHasMfa(targets)) {
    throw new Error("Academia login requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
  }

  if (await anyTargetHasInvalidCredentials(targets)) {
    throw new Error("Academia login failed: invalid college credentials");
  }

  // Accept either the academia app domain or remaining on Zoho accounts sub-path (cookies are still valid).
  await page.waitForURL(/academia\.srmist\.edu\.in/i, { timeout: 60000 }).catch(() => undefined);
}

async function scrapeAcademiaDataWithPlaywright({
  collegeEmail,
  collegePassword,
  storageStatePath = null,
  storageState = null,
  scrapeMode = "full"
}) {
  const totalStartMs = Date.now();
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `cd gak-backend && npm i playwright` to enable SRM Academia scraping.");
  }

  const baseUrl = process.env.ACADEMIA_BASE_URL || "https://academia.srmist.edu.in";
  const attendanceUrl = resolveAcademiaRouteUrl(
    process.env.ACADEMIA_ATTENDANCE_URL,
    `${baseUrl}/#Page:My_Attendance`
  );
  const timetableUrl = resolveAcademiaRouteUrl(
    process.env.ACADEMIA_TIMETABLE_URL,
    `${baseUrl}/#Page:My_Time_Table`
  );
  const marksUrl = resolveAcademiaRouteUrl(
    process.env.ACADEMIA_MARKS_URL,
    `${baseUrl}/#Page:My_Marks`
  );
  const mode = String(scrapeMode || "full").toLowerCase();
  const needsTimetable = mode !== "marks_attendance";
  const needsMarks = mode !== "reports";
  const needsAttendance = mode !== "reports";

  const attendanceCandidateUrlsFull = [...new Set([
    attendanceUrl,
    `${baseUrl}/#Page:My_Attendance`,
    `${baseUrl}/#Page:Academic_Reports_Unified`,
    `${baseUrl}/#Page:My_Time_Table`,
    `${baseUrl}/#Page:Academic_Calendar`
  ])];
  const timetableCandidateUrlsFull = [...new Set([
    timetableUrl,
    `${baseUrl}/#Page:My_Time_Table`,
    `${baseUrl}/#Page:Unified_Time_Table`,
    `${baseUrl}/#Page:Academic_Reports_Unified`,
    `${baseUrl}/#Page:Academic_Calendar`,
    `${baseUrl}/#Page:Academic_Reports`,
    `${baseUrl}/#Page:Day_Order`,
    `${baseUrl}/student/timetable`
  ])];
  const marksCandidateUrlsFull = [...new Set([
    marksUrl,
    `${baseUrl}/#Page:My_Marks`,
    `${baseUrl}/#Page:Academic_Reports_Unified`,
    `${baseUrl}/student/marks`
  ])];
  const attendanceCandidateUrls = needsAttendance
    ? (mode === "marks_attendance"
      ? [...new Set([attendanceUrl, `${baseUrl}/#Page:My_Attendance`])]
      : attendanceCandidateUrlsFull)
    : [];
  const timetableCandidateUrls = needsTimetable
    ? (mode === "reports"
      ? [...new Set([
          timetableUrl,
          `${baseUrl}/#Page:My_Time_Table`,
          `${baseUrl}/#Page:Unified_Time_Table`,
          `${baseUrl}/#Page:Academic_Reports_Unified`,
          `${baseUrl}/#Page:Academic_Calendar`,
          `${baseUrl}/#Page:Academic_Reports`,
          `${baseUrl}/#Page:Day_Order`
        ])]
      : timetableCandidateUrlsFull)
    : [];
  const marksCandidateUrls = needsMarks
    ? (mode === "marks_attendance"
      ? [...new Set([marksUrl, `${baseUrl}/#Page:My_Marks`, `${baseUrl}/student/marks`])]
      : marksCandidateUrlsFull)
    : [];

  const headlessRaw = String(process.env.ACADEMIA_PLAYWRIGHT_HEADLESS || "").trim().toLowerCase();
  const forceHeadlessSync = String(process.env.ACADEMIA_FORCE_HEADLESS_SYNC || "true").toLowerCase().trim() !== "false";
  const headless = forceHeadlessSync ? true : (headlessRaw === "false" ? false : true);
  const debug = String(process.env.ACADEMIA_DEBUG_SCRAPE || "").toLowerCase() === "true";
  const configuredStatePath = storageStatePath || String(process.env.ACADEMIA_STORAGE_STATE_PATH || "").trim();
  const effectiveStatePath = configuredStatePath && fs.existsSync(configuredStatePath) ? configuredStatePath : null;

  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    storageState: storageState || (effectiveStatePath || undefined)
  });
  const page = await context.newPage();
  const jsonPayloads = [];
  let loginMs = 0;
  let pageFetchMs = 0;

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
      const loginStartMs = Date.now();
      await loginViaBrowser(page, {
        baseUrl,
        collegeEmail: String(collegeEmail || "").trim().toLowerCase(),
        collegePassword: String(collegePassword || "")
      });
      loginMs = Date.now() - loginStartMs;
    }

    const gotoAndExtract = async (url, kind = "generic") => {
      // The SRM portal is a hash-based SPA and can keep long-polling connections open,
      // so `networkidle` is not always a reliable signal that data tables are rendered.
      const defaultSettleMs = mode === "marks_attendance" ? 8000 : mode === "reports" ? 15000 : 20000;
      const configuredSettleMs = Number(process.env.ACADEMIA_SPA_SETTLE_MS || defaultSettleMs);
      const maxSettleMs = mode === "marks_attendance" ? 12000 : 25000;
      const settleMs = Math.min(maxSettleMs, Math.max(1500, configuredSettleMs));

      const hashIdx = String(url || "").indexOf("#");
      const base = hashIdx >= 0 ? String(url).slice(0, hashIdx) : String(url);
      const hash = hashIdx >= 0 ? String(url).slice(hashIdx) : "";

      await gotoWithRetry(
        page,
        base || url,
        { waitUntil: "domcontentloaded", timeout: 90000 },
        { attempts: 3, backoffMs: 800 }
      );
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
      let marksNavProbeDone = false;

      const dismissOverlaysBestEffort = async () => {
        const candidates = [
          "button:has-text('Skip')",
          "button:has-text('Skip now')",
          "button:has-text('Not now')",
          "button:has-text('No thanks')",
          "button:has-text('Later')",
          "button:has-text('Maybe later')",
          "button:has-text('Continue')",
          "button:has-text('Continue anyway')",
          "button:has-text('Dismiss')",
          "[aria-label='Close']",
          "button[aria-label='Close']",
          "button:has-text('Close')",
          "button:has-text('Done')"
        ];
        await page.keyboard.press("Escape").catch(() => undefined);

        const targets = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
        for (const frame of targets) {
          for (const sel of candidates) {
            await frame.locator(sel).first().click({ timeout: 500 }).catch(() => undefined);
          }
          await frame.evaluate(() => {
            const phrases = ["upgrade to creator", "creator 5", "upgrade now", "switch to creator", "creator plan"];
            const nodes = Array.from(document.querySelectorAll("[role='dialog'], .modal, .popup, .overlay, .modal-backdrop, .popup-backdrop, .overlay-backdrop, div, section"));
            for (const node of nodes) {
              const el = node;
              if (!(el instanceof HTMLElement)) continue;
              const style = window.getComputedStyle(el);
              const z = Number.parseInt(String(style.zIndex || "0"), 10);
              const isBlockingPosition = style.position === "fixed" || style.position === "sticky" || z >= 999;
              if (!isBlockingPosition) continue;
              const text = String(el.innerText || "").toLowerCase().replace(/\s+/g, " ").trim();
              const hasPhrase = phrases.some((p) => text.includes(p));
              const isBackdrop = !text && (style.pointerEvents !== "none" || style.opacity === "1");
              if (hasPhrase || isBackdrop) {
                el.remove();
              }
            }
          }).catch(() => undefined);
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

      const frameSignalScore = (kindHint, html, text) => {
        const tableRows = parseRowsFromHtmlTables(html).length;
        const timetableRows = parseTimetableRows(html).length + parseTimetableRowsFromText(text).length;
        const marksRows = parseMarksRows(html).length + parseMarksRowsFromText(text).length;
        const attendanceRows = parseAndNormalizeAttendance({ html, text }).attendance.length;
        const unifiedTemplateRows = parseUnifiedTimeGridTemplate(html).length;
        const calendarRows = parseAcademicCalendarRowsFromHtml(html).length + parseAcademicCalendarRowsFromText(text).length;

        if (kindHint === "attendance") {
          return (attendanceRows * 1000) + (timetableRows * 150) + (marksRows * 20) + (unifiedTemplateRows * 10) + tableRows;
        }
        if (kindHint === "timetable") {
          return (unifiedTemplateRows * 600) + (timetableRows * 200) + (calendarRows * 50) + tableRows;
        }
        if (kindHint === "marks") {
          return (marksRows * 300) + (tableRows * 2);
        }
        return tableRows + unifiedTemplateRows + timetableRows + marksRows + attendanceRows;
      };

      while (Date.now() - start < settleMs) {
        if (await pageHasCaptchaChallenge(page)) {
          throw new Error(
            "Academia scrape blocked by captcha challenge while loading page. Use scripts/academia-capture-state.js to save a session state and retry."
          );
        }
        if (isMfaBlockEnabled() && await pageHasMfaChallenge(page)) {
          throw new Error("Academia scrape requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
        }

        await dismissOverlaysBestEffort().catch(() => undefined);

        const targets = await collectTargets();
        // Pick the frame with the strongest parsing signal for this scrape kind.
        let best = { html: "", text: "", signalScore: -1, fallbackScore: -1 };
        for (const frame of targets) {
          const html = await frame.content().catch(() => "");
          const text = await frame.evaluate(() => String(document?.body?.innerText || "")).catch(() => "");
          const signalScore = frameSignalScore(kind, html, text);
          const fallbackScore = (html ? html.length : 0) + (text ? text.length * 2 : 0);
          if (signalScore > best.signalScore || (signalScore === best.signalScore && fallbackScore > best.fallbackScore)) {
            best = { html, text, signalScore, fallbackScore };
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
          if (
            parseTimetableRows(html).length > 0
            || parseTimetableRowsFromText(text).length > 0
            || parseUnifiedTimeGridTemplate(html).length > 0
            || parseAcademicCalendarRowsFromHtml(html).length > 0
          ) {
            return { html, text };
          }
        } else if (kind === "marks") {
          if (parseMarksRows(html).length > 0 || parseMarksRowsFromText(text).length > 0) {
            return { html, text };
          }
          if (!marksNavProbeDone) {
            marksNavProbeDone = true;
            await clickOnAnyTarget(
              targets,
              [
                "a[href*='My_Marks']",
                "a[href*='Marks']",
                "a:has-text('My Marks')",
                "a:has-text('Marks')",
                "button:has-text('My Marks')",
                "button:has-text('Marks')"
              ],
              2500
            ).catch(() => undefined);
          }
        } else if (parseRowsFromHtmlTables(html).length > 0) {
          return { html, text };
        }

        await page.waitForTimeout(1200);
      }

      // Final attempt: return the last HTML even if our readiness heuristics didn't trigger.
      if (await pageHasCaptchaChallenge(page)) {
        throw new Error(
          "Academia scrape blocked by captcha challenge while loading page. Use scripts/academia-capture-state.js to save a session state and retry."
        );
      }
      if (isMfaBlockEnabled() && await pageHasMfaChallenge(page)) {
        throw new Error("Academia scrape requires manual action (MFA/OTP). Complete verification manually, then retry sync.");
      }
      return { html: lastHtml || (await page.content()), text: lastText };
    };

    const pageFetchStartMs = Date.now();
    let lastExtractError = null;
    let bestExtract = {
      attendance: [],
      attendanceDaily: [],
      attendanceVersion: null,
      timetable: [],
      marks: [],
      academicCalendar: [],
      score: -1,
      sourceUrl: null,
      batchNumber: null
    };
    let bestUnifiedTemplateRows = [];
    let bestCalendarRows = [];
    const templateCandidates = [];
    const dynamicTimetableCandidateUrls = [...timetableCandidateUrls];
    const seenDynamicTimetableUrls = new Set(dynamicTimetableCandidateUrls);
    const dynamicMarksCandidateUrls = [...marksCandidateUrls];
    const seenDynamicMarksUrls = new Set(dynamicMarksCandidateUrls);
    const enqueueTimetableCandidates = (html, text) => {
      const discovered = discoverTimetableHashUrls({ html, text, baseUrl });
      for (const candidate of discovered) {
        if (seenDynamicTimetableUrls.has(candidate)) continue;
        seenDynamicTimetableUrls.add(candidate);
        dynamicTimetableCandidateUrls.push(candidate);
      }
    };
    const enqueueMarksCandidates = (html, text) => {
      const discovered = discoverMarksHashUrls({ html, text, baseUrl });
      for (const candidate of discovered) {
        if (seenDynamicMarksUrls.has(candidate)) continue;
        seenDynamicMarksUrls.add(candidate);
        dynamicMarksCandidateUrls.push(candidate);
      }
    };

    const seedHtml = await page.content().catch(() => "");
    const seedText = await page.evaluate(() => String(document?.body?.innerText || "")).catch(() => "");
    enqueueTimetableCandidates(seedHtml, seedText);
    enqueueMarksCandidates(seedHtml, seedText);

    for (const candidateUrl of attendanceCandidateUrls) {
      try {
        const raw = await gotoAndExtract(candidateUrl, "attendance");
        enqueueTimetableCandidates(raw.html, raw.text);
        enqueueMarksCandidates(raw.html, raw.text);
        const attendanceParsed = parseAndNormalizeAttendance({ html: raw.html, text: raw.text });
        const timetableFromHtml = parseTimetableRows(raw.html);
        const timetableFromText = parseTimetableRowsFromText(raw.text);
        const unifiedTemplate = parseUnifiedTimeGridTemplate(raw.html);
        const calendarFromHtml = parseAcademicCalendarRowsFromHtml(raw.html);
        const calendarFromText = parseAcademicCalendarRowsFromText(raw.text);
        const calendarRows = dedupeAcademicCalendarRows([...calendarFromHtml, ...calendarFromText]);
        const marksFromHtml = parseMarksRows(raw.html);
        const marksFromText = parseMarksRowsFromText(raw.text);

        const timetable = timetableFromHtml.length ? timetableFromHtml : timetableFromText;
        if (unifiedTemplate.length > bestUnifiedTemplateRows.length) {
          bestUnifiedTemplateRows = unifiedTemplate;
        }
        if (unifiedTemplate.length > 0) {
          templateCandidates.push({
            rows: unifiedTemplate,
            url: candidateUrl,
            batchNumber: extractBatchNumber(`${candidateUrl} ${raw.text || ""}`)
          });
        }
        if (calendarRows.length > bestCalendarRows.length) {
          bestCalendarRows = calendarRows;
        }
        const marks = dedupeMarksRows([...(marksFromHtml || []), ...(marksFromText || [])]);
        const attendance = attendanceParsed.attendance || [];
        const score = (attendance.length * 1000) + (timetable.length * 100) + marks.length;
        if (debug) {
          console.log("[academia-scrape-debug] attendance candidate", {
            url: candidateUrl,
            attendanceRows: attendance.length,
            timetableRows: timetable.length,
            marksRows: marks.length,
            marksFromHtml: marksFromHtml.length,
            marksFromText: marksFromText.length,
            marksSample: marks.slice(0, 4).map((row) => ({
              subjectName: row?.subjectName || row?.subject_name || null,
              componentName: row?.componentName || row?.component_name || null,
              score: row?.score ?? null,
              maxScore: row?.maxScore ?? row?.max_score ?? null
            }))
          });
        }

        if (score > bestExtract.score) {
          const candidateBatchNumber = extractBatchNumber(`${candidateUrl} ${raw.text || ""}`);
          bestExtract = {
            attendance,
            attendanceDaily: attendanceParsed.dailyEntries || [],
            attendanceVersion: attendanceParsed.version || null,
            timetable,
            marks,
            academicCalendar: calendarRows,
            score,
            sourceUrl: candidateUrl,
            batchNumber: Number.isFinite(candidateBatchNumber) ? candidateBatchNumber : null
          };
        }

        const hasRequiredAttendance = !needsAttendance || attendance.length > 0;
        const hasRequiredTimetable = !needsTimetable || timetable.length > 0;
        const hasUsefulMarks = !needsMarks || marks.length > 0 || mode === "marks_attendance";
        if (hasRequiredAttendance && hasRequiredTimetable && hasUsefulMarks) {
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
    for (let idx = 0; idx < dynamicTimetableCandidateUrls.length; idx += 1) {
      const candidateUrl = dynamicTimetableCandidateUrls[idx];
      try {
        const raw = await gotoAndExtract(candidateUrl, "timetable");
        enqueueTimetableCandidates(raw.html, raw.text);
        enqueueMarksCandidates(raw.html, raw.text);
        const timetableFromHtml = parseTimetableRows(raw.html);
        const timetableFromText = parseTimetableRowsFromText(raw.text);
        const unifiedTemplate = parseUnifiedTimeGridTemplate(raw.html);
        const calendarFromHtml = parseAcademicCalendarRowsFromHtml(raw.html);
        const calendarFromText = parseAcademicCalendarRowsFromText(raw.text);
        const calendarRows = dedupeAcademicCalendarRows([...calendarFromHtml, ...calendarFromText]);
        const candidateRows = timetableFromHtml.length ? timetableFromHtml : timetableFromText;
        if (unifiedTemplate.length > bestUnifiedTemplateRows.length) {
          bestUnifiedTemplateRows = unifiedTemplate;
        }
        if (unifiedTemplate.length > 0) {
          templateCandidates.push({
            rows: unifiedTemplate,
            url: candidateUrl,
            batchNumber: extractBatchNumber(`${candidateUrl} ${raw.text || ""}`)
          });
        }
        if (calendarRows.length > bestCalendarRows.length) {
          bestCalendarRows = calendarRows;
        }
        if (debug) {
          const dayCountDebug = new Set(
            candidateRows.map((row) => Number(row.dayOrder)).filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
          ).size;
          console.log("[academia-scrape-debug] timetable candidate", {
            url: candidateUrl,
            rows: candidateRows.length,
            dayOrders: dayCountDebug,
            unifiedTemplateRows: unifiedTemplate.length,
            calendarRows: calendarRows.length
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
    const marksSubjectsFound = new Set(
      (bestMarksRows || [])
        .map((row) => cleanText(row?.subjectName || row?.subject_name || "").toLowerCase())
        .filter(Boolean)
    ).size;
    const shouldProbeMarksPage = mode === "marks_attendance"
      ? marksSubjectsFound < 3
      : true;
    for (let idx = 0; idx < (shouldProbeMarksPage ? dynamicMarksCandidateUrls.length : 0); idx += 1) {
      const candidateUrl = dynamicMarksCandidateUrls[idx];
      try {
        const raw = await gotoAndExtract(candidateUrl, "marks");
        enqueueMarksCandidates(raw.html, raw.text);
        const marksFromHtml = parseMarksRows(raw.html);
        const marksFromText = parseMarksRowsFromText(raw.text);
        const candidateRows = dedupeMarksRows([...(marksFromHtml || []), ...(marksFromText || [])]);
        if (debug) {
          const discoveredMarkRoutes = discoverMarksHashUrls({ html: raw.html, text: raw.text, baseUrl });
          const textPreview = String(raw.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
          console.log("[academia-scrape-debug] marks candidate", {
            url: candidateUrl,
            rows: candidateRows.length,
            marksFromHtml: marksFromHtml.length,
            marksFromText: marksFromText.length,
            discoveredMarkRoutes: discoveredMarkRoutes.slice(0, 5),
            textPreview
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

    pageFetchMs = Date.now() - pageFetchStartMs;
    const parseStartMs = Date.now();
    const jsonAttendance = needsAttendance ? parseAttendanceRowsFromJsonPayloads(jsonPayloads) : [];
    const jsonTimetable = needsTimetable ? parseTimetableRowsFromJsonPayloads(jsonPayloads) : [];
    const jsonMarks = needsMarks
      ? parseMarksRowsFromJsonPayloads(jsonPayloads, [...bestTimetableRows, ...jsonTimetable])
      : [];
    const mergedAttendance = needsAttendance
      ? normalizeAttendanceRows([...(bestExtract.attendance || []), ...jsonAttendance])
      : [];
    const mergedDaily = normalizeDailyEntries(bestExtract.attendanceDaily || []);
    const preferredBatchRaw = Number(process.env.ACADEMIA_UNIFIED_BATCH_PREFERENCE || "");
    const preferredBatch = Number.isFinite(preferredBatchRaw) && preferredBatchRaw > 0 ? Math.round(preferredBatchRaw) : null;
    const uniqueTemplateCandidates = [];
    const seenTemplateFingerprint = new Set();
    for (const candidate of templateCandidates) {
      const fingerprint = createHash("sha1")
        .update(JSON.stringify((candidate.rows || []).map((r) => [r.dayOrder, r.slotToken, r.startTime, r.endTime])))
        .digest("hex");
      if (seenTemplateFingerprint.has(fingerprint)) continue;
      seenTemplateFingerprint.add(fingerprint);
      uniqueTemplateCandidates.push(candidate);
    }

    const evaluateTemplateScore = (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return -1;
      const mappedPrimary = hydrateTimetableWithUnifiedTemplate(bestTimetableRows, rows);
      const mappedSecondary = hydrateTimetableWithUnifiedTemplate(jsonTimetable, rows);
      const merged = [...mappedPrimary, ...mappedSecondary];
      const mappedWithDay = merged.filter((row) => {
        const day = Number(row?.dayOrder ?? row?.day_order);
        return Number.isFinite(day) && day >= 1 && day <= 7;
      }).length;
      const uniqueDays = new Set(
        merged
          .map((row) => Number(row?.dayOrder ?? row?.day_order))
          .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
      ).size;
      return (mappedWithDay * 100) + (uniqueDays * 10);
    };

    let selectedTemplateRows = bestUnifiedTemplateRows;
    let selectedTemplateMeta = null;
    if (uniqueTemplateCandidates.length > 0) {
      let ranked = uniqueTemplateCandidates.map((candidate) => ({
        ...candidate,
        score: evaluateTemplateScore(candidate.rows)
      }));
      if (preferredBatch !== null) {
        const preferred = ranked.filter((candidate) => candidate.batchNumber === preferredBatch);
        if (preferred.length > 0) {
          ranked = preferred;
        }
      }
      ranked.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aBatch = Number.isFinite(a.batchNumber) ? Number(a.batchNumber) : -1;
        const bBatch = Number.isFinite(b.batchNumber) ? Number(b.batchNumber) : -1;
        if (bBatch !== aBatch) return bBatch - aBatch;
        return String(a.url || "").localeCompare(String(b.url || ""));
      });
      selectedTemplateMeta = ranked[0] || null;
      selectedTemplateRows = selectedTemplateMeta?.rows || bestUnifiedTemplateRows;
    }

    const mappedTimetableRows = needsTimetable ? hydrateTimetableWithUnifiedTemplate(bestTimetableRows, selectedTemplateRows) : [];
    const mappedJsonTimetableRows = needsTimetable ? hydrateTimetableWithUnifiedTemplate(jsonTimetable, selectedTemplateRows) : [];
    const hasTemplateMapping = selectedTemplateRows.length > 0 && (mappedTimetableRows.length > 0 || mappedJsonTimetableRows.length > 0);
    const rawTimetableRows = hasTemplateMapping
      ? [...bestTimetableRows, ...jsonTimetable].filter((row) => {
          const day = Number(row?.dayOrder ?? row?.day_order);
          return Number.isFinite(day) && day >= 1 && day <= 7;
        })
      : [...bestTimetableRows, ...jsonTimetable];
    const mergedTimetable = needsTimetable
      ? (() => {
          const deduped = dedupeTimetableRows([...mappedTimetableRows, ...mappedJsonTimetableRows, ...rawTimetableRows]);
          if (!hasTemplateMapping) {
            return deduped;
          }
          const normalizeSubject = (value) => String(value || "").trim().toLowerCase();
          const scheduledSubjects = new Set(
            deduped
              .filter((row) => {
                const day = Number(row?.dayOrder ?? row?.day_order);
                const hasTime = Boolean(row?.startTime || row?.start_time || row?.endTime || row?.end_time);
                return Number.isFinite(day) && day >= 1 && day <= 7 && hasTime;
              })
              .map((row) => normalizeSubject(row?.subjectName ?? row?.subject_name))
              .filter(Boolean)
          );
          return deduped.filter((row) => {
            const subjectKey = normalizeSubject(row?.subjectName ?? row?.subject_name);
            if (!subjectKey || !scheduledSubjects.has(subjectKey)) {
              return true;
            }
            const day = Number(row?.dayOrder ?? row?.day_order);
            const hasTime = Boolean(row?.startTime || row?.start_time || row?.endTime || row?.end_time);
            return Number.isFinite(day) && day >= 1 && day <= 7 && hasTime;
          });
        })()
      : [];
    const mergedMarks = needsMarks ? dedupeMarksRows([...bestMarksRows, ...jsonMarks]) : [];
    const mergedAcademicCalendar = dedupeAcademicCalendarRows([...(bestExtract.academicCalendar || []), ...bestCalendarRows]);

    const result = {
      // Attendance page is the most stable source; we also try alternate SRM pages + JSON payloads.
      timetable: mergedTimetable,
      marks: mergedMarks,
      attendance: mergedAttendance,
      academicCalendar: mergedAcademicCalendar,
      attendanceDaily: mergedDaily,
      attendanceVersion: computeAttendanceVersion(mergedAttendance),
      sourceUrl: bestExtract.sourceUrl || selectedTemplateMeta?.url || null,
      batchNumber: Number.isFinite(selectedTemplateMeta?.batchNumber)
        ? Math.round(selectedTemplateMeta.batchNumber)
        : (Number.isFinite(bestExtract.batchNumber) ? Math.round(bestExtract.batchNumber) : null),
      timings: {
        loginMs,
        pageFetchMs,
        parseMs: Date.now() - parseStartMs,
        totalMs: Date.now() - totalStartMs
      }
    };

    if (!result.attendance.length && !result.timetable.length && !result.marks.length && !result.academicCalendar.length) {
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

async function scrapeAcademiaData({
  collegeEmail,
  collegePassword,
  storageStatePath = null,
  storageState = null,
  scrapeMode = "full"
}) {
  const mode = String(process.env.ACADEMIA_SCRAPE_MODE || "").toLowerCase();
  const normalizedScrapeMode = String(scrapeMode || "full").toLowerCase();
  const attemptsRaw = normalizedScrapeMode === "marks_attendance"
    ? (process.env.ACADEMIA_RETRY_ATTEMPTS_FAST || 2)
    : normalizedScrapeMode === "reports"
      ? (process.env.ACADEMIA_RETRY_ATTEMPTS_REPORTS || 2)
      : (process.env.ACADEMIA_RETRY_ATTEMPTS || 3);
  const attempts = Math.max(1, Number(attemptsRaw || 1));
  const backoffMs = Math.max(300, Number(process.env.ACADEMIA_RETRY_BACKOFF_MS || 1200));
  const usesHashPages =
    String(process.env.ACADEMIA_TIMETABLE_URL || "").includes("#Page:")
    || String(process.env.ACADEMIA_MARKS_URL || "").includes("#Page:")
    || String(process.env.ACADEMIA_ATTENDANCE_URL || "").includes("#Page:");

  if (mode === "playwright" || usesHashPages) {
    try {
      return await withRetry(
        () => scrapeAcademiaDataWithPlaywright({
          collegeEmail,
          collegePassword,
          storageStatePath,
          storageState,
          scrapeMode: normalizedScrapeMode
        }),
        { attempts, backoffMs }
      );
    } catch (error) {
      if (isFatalScrapeError(error)) {
        const detail = String(error?.message || "unknown playwright error");
        throw new Error(`Academia scraping failed after ${attempts} attempts (playwright): ${detail}`);
      }

      const playwrightMsg = String(error?.message || "").toLowerCase();
      if (
        playwrightMsg.includes("no readable rows")
        || playwrightMsg.includes("content blocked by an overlay")
        || playwrightMsg.includes("try one-time login")
        || playwrightMsg.includes("maximum concurrent sessions")
        || playwrightMsg.includes("concurrent active sessions")
        || playwrightMsg.includes("session limit")
        || playwrightMsg.includes("block-sessions")
      ) {
        // HTTP fallback won't help when the SPA rendered but our selectors/parsers couldn't extract rows.
        const detail = String(error?.message || "unknown playwright error");
        throw new Error(`Academia scraping failed after ${attempts} attempts (playwright): ${detail}`);
      }

      try {
        return await withRetry(
          () => scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword, scrapeMode: normalizedScrapeMode }),
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
      () => scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword, scrapeMode: normalizedScrapeMode }),
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
      const targetsNow = await resolveZohoLoginTargets(page);
      if (await anyTargetHasSessionLimitExceeded(targetsNow)) {
        const resolved = await maybeResolveSessionLimitExceeded(page);
        if (!resolved) {
          throw new Error(
            "Session limit exceeded. Sign out of SRM/Zoho elsewhere and retry."
          );
        }
        await page.waitForTimeout(2500);
      }

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
    parseAcademicCalendarRowsFromHtml,
    parseAcademicCalendarRowsFromText,
    parseUnifiedTimeGridTemplate,
    hydrateTimetableWithUnifiedTemplate,
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

const { randomUUID } = require("crypto");
let playwright = null;
try {
  // Optional dependency: only required when scraping hash-based SPA pages.
  // Installed via `npm i playwright`.
  playwright = require("playwright");
} catch (_error) {
  playwright = null;
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

function parseDayOrder(value) {
  const text = String(value || "").toLowerCase();
  const dayOrderMatch = text.match(/day\s*[- ]?order\s*(\d+)/i) || text.match(/\bday\s*(\d+)\b/i);
  if (dayOrderMatch) {
    return Number(dayOrderMatch[1]);
  }

  if (/monday|mon\b/.test(text)) return 1;
  if (/tuesday|tue\b/.test(text)) return 2;
  if (/wednesday|wed\b/.test(text)) return 3;
  if (/thursday|thu\b/.test(text)) return 4;
  if (/friday|fri\b/.test(text)) return 5;
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

  return parsed;
}

function parseMarksRows(html) {
  const rows = parseRowsFromHtmlTables(html);
  const parsed = [];

  for (const cells of rows) {
    if (cells.length < 2) {
      continue;
    }

    const scoreCell = cells.find((c) => /\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/.test(c));
    if (!scoreCell) {
      continue;
    }

    const scoreMatch = scoreCell.match(/(\d+(\.\d+)?)\s*\/\s*(\d+(\.\d+)?)/);
    if (!scoreMatch) {
      continue;
    }

    const score = Number(scoreMatch[1]);
    const maxScore = Number(scoreMatch[3]);
    if (maxScore <= 0) {
      continue;
    }

    const subjectName = cells[0];
    const componentName = cells[1] || "overall";

    parsed.push({
      id: randomUUID(),
      subjectName,
      componentName,
      score,
      maxScore,
      percentage: Number(((score / maxScore) * 100).toFixed(2))
    });
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

  return parsed;
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

async function fetchText(url, { method = "GET", body = null, cookieHeader = "", headers: extraHeaders = {} } = {}) {
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

  const response = await fetch(url, requestInit);
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

  const timetable = parseTimetableRows(timetablePage.text);
  const marks = parseMarksRows(marksPage.text);
  const attendance = parseAttendanceRows(attendancePage.text);

  return {
    timetable,
    marks,
    attendance
  };
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 1500 });
        await locator.fill(value);
        return true;
      }
    } catch (_error) {
      continue;
    }
  }
  return false;
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        await locator.waitFor({ state: "visible", timeout: 1500 });
        await locator.click();
        return true;
      }
    } catch (_error) {
      continue;
    }
  }
  return false;
}

async function loginViaBrowser(page, { baseUrl, collegeEmail, collegePassword }) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // Zoho IAM sign-in typically prompts for email first, then password.
  const emailOk = await fillFirstVisible(
    page,
    ["#login_id", "input[name='login_id']", "input[type='email']", "input[name='LOGIN_ID']"],
    collegeEmail
  );
  if (emailOk) {
    await clickFirstVisible(page, ["#nextbtn", "button:has-text('Next')", "button:has-text('Continue')"]);
  }

  const passwordOk = await fillFirstVisible(
    page,
    ["#password", "input[name='password']", "input[type='password']"],
    collegePassword
  );
  if (!passwordOk) {
    // Some sessions might redirect straight in; don't hard-fail here.
    return;
  }

  await clickFirstVisible(page, ["#nextbtn", "button:has-text('Sign in')", "button:has-text('Sign In')", "button:has-text('Login')"]);

  // Wait until we land back on the academia app or a hash-page URL.
  await page.waitForURL(/academia\.srmist\.edu\.in/i, { timeout: 60000 }).catch(() => undefined);
}

async function scrapeAcademiaDataWithPlaywright({ collegeEmail, collegePassword }) {
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `cd gak-backend && npm i playwright` to enable SRM Academia scraping.");
  }

  const baseUrl = process.env.ACADEMIA_BASE_URL || "https://academia.srmist.edu.in";
  const timetableUrl = process.env.ACADEMIA_TIMETABLE_URL || `${baseUrl}/#Page:My_Time_Table_2023_24`;
  const marksUrl = process.env.ACADEMIA_MARKS_URL || `${baseUrl}/#Page:My_Attendance`;
  const attendanceUrl = process.env.ACADEMIA_ATTENDANCE_URL || `${baseUrl}/#Page:My_Attendance`;

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    await loginViaBrowser(page, {
      baseUrl,
      collegeEmail: String(collegeEmail || "").trim().toLowerCase(),
      collegePassword: String(collegePassword || "")
    });

    const gotoAndExtract = async (url) => {
      await page.goto(url, { waitUntil: "networkidle" });
      // Allow any SPA rendering to settle.
      await page.waitForTimeout(1500);
      return page.content();
    };

    const timetableHtml = await gotoAndExtract(timetableUrl);
    const marksHtml = await gotoAndExtract(marksUrl);
    const attendanceHtml = await gotoAndExtract(attendanceUrl);

    return {
      timetable: parseTimetableRows(timetableHtml),
      marks: parseMarksRows(marksHtml),
      attendance: parseAttendanceRows(attendanceHtml)
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function scrapeAcademiaData({ collegeEmail, collegePassword }) {
  const mode = String(process.env.ACADEMIA_SCRAPE_MODE || "").toLowerCase();
  const usesHashPages =
    String(process.env.ACADEMIA_TIMETABLE_URL || "").includes("#Page:")
    || String(process.env.ACADEMIA_MARKS_URL || "").includes("#Page:")
    || String(process.env.ACADEMIA_ATTENDANCE_URL || "").includes("#Page:");

  if (mode === "playwright" || usesHashPages) {
    return scrapeAcademiaDataWithPlaywright({ collegeEmail, collegePassword });
  }

  return scrapeAcademiaDataWithHttp({ collegeEmail, collegePassword });
}

module.exports = {
  scrapeAcademiaData
};

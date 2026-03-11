const { createHash } = require("crypto");
const path = require("path");
const fs = require("fs");

const integrationModel = require("../models/integration.model");
const fitModel = require("../models/fit.model");
const { ensureGoogleOauthConfig, getGoogleAuthUrl, getTokensFromCode, buildAuthedClient, google, getScopesForPurpose } = require("../config/google");
const { decrypt, encrypt } = require("../utils/encryption.util");
const { createOAuthStateToken, verifyOAuthStateToken } = require("../utils/oauth-state.util");
const {
  isRelevantAcademicEmail,
  isLikelyAcademicDeadlineTitle,
  analyzeAcademicEmail,
  extractDeadline,
  buildAcademicDeadlineTitle,
  extractGmailMessageText,
  deriveAcademicSource
} = require("../utils/email.util");
const { scrapeAcademiaData, captureAcademiaStorageState } = require("../utils/academia.scraper.util");
const { createId, createNonce } = require("../utils/id.util");

function isGoogleConfigured() {
  try {
    ensureGoogleOauthConfig();
    return true;
  } catch (_error) {
    return false;
  }
}

function requireGoogleConfigured() {
  ensureGoogleOauthConfig();
}

function getOAuthStateTtlMs() {
  return Math.max(30_000, Number(process.env.OAUTH_STATE_TTL_MS || 10 * 60 * 1000));
}

function isRefreshTokenRevocationError(error) {
  const message = String(error?.message || "").toLowerCase();
  const apiError = String(error?.response?.data?.error || "").toLowerCase();
  return (
    message.includes("invalid_grant")
    || message.includes("token has been expired or revoked")
    || apiError.includes("invalid_grant")
    || apiError.includes("invalid_token")
  );
}

function normalizeGoogleAccount(account) {
  if (!account) {
    return null;
  }

  const scopesRaw = account.granted_scopes;
  const granted = parseGrantedScopes(scopesRaw);
  const requiredFitScopes = [
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.body.read"
  ];
  const requiredCalendarGmailScopes = getScopesForPurpose("calendar_gmail").filter((s) => !["openid", "email", "profile"].includes(String(s)));

  return {
    accountId: account.account_id,
    userId: account.user_id,
    googleId: account.google_id || null,
    email: account.google_email || null,
    name: account.google_name || null,
    tokenExpiry: account.google_token_expiry || null,
    isPrimary: Number(account.is_primary || 0) === 1,
    hasFitPermissions: scopesRaw ? hasRequiredScopes(granted, requiredFitScopes) : null,
    hasCalendarGmailPermissions: scopesRaw ? hasRequiredScopes(granted, requiredCalendarGmailScopes) : null,
    createdAt: account.created_at || null,
    updatedAt: account.updated_at || null
  };
}

async function listConnectedGoogleAccounts(userId) {
  const rows = await integrationModel.listUserGoogleAccounts(userId);
  return rows.map((row) => normalizeGoogleAccount(row)).filter(Boolean);
}

async function getFitAccountSelection(userId) {
  const accountId = await integrationModel.getFitGoogleAccountId(userId);
  if (!accountId) {
    return { accountId: null, account: null };
  }
  const account = await integrationModel.getGoogleAccountById(userId, accountId);
  return { accountId, account: normalizeGoogleAccount(account) };
}

function pickAutoFitAccountCandidate(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (!list.length) return null;

  const fitReady = list.filter((row) => row && row.hasFitPermissions === true);
  if (fitReady.length === 1) {
    return fitReady[0];
  }

  if (list.length === 1) {
    return list[0];
  }

  return null;
}

async function requireFitAccountSelection(userId) {
  const selection = await getFitAccountSelection(userId);
  if (selection.accountId && selection.account) {
    return { ok: true, accountId: selection.accountId, account: selection.account };
  }

  const accounts = await listConnectedGoogleAccounts(userId);
  const autoCandidate = pickAutoFitAccountCandidate(accounts);
  if (!autoCandidate) {
    if (!accounts.length) {
      return { ok: false, reason: "Google account not connected" };
    }
    if (selection.accountId && !selection.account) {
      return { ok: false, reason: "Selected Google Fit account is not connected" };
    }
    return { ok: false, reason: "Google Fit account not selected" };
  }

  // Auto-lock the fit account when there is exactly one unambiguous candidate.
  if (!selection.accountId) {
    await integrationModel.setFitGoogleAccountSelectionOnce(userId, autoCandidate.accountId).catch(() => false);
    return { ok: true, accountId: autoCandidate.accountId, account: autoCandidate };
  }

  // Heal stale selection (locked account removed) by switching to the only valid connected account.
  if (!selection.account) {
    await integrationModel.clearFitGoogleAccountSelection(userId).catch(() => undefined);
    await integrationModel.setFitGoogleAccountSelectionOnce(userId, autoCandidate.accountId).catch(() => false);
    return { ok: true, accountId: autoCandidate.accountId, account: autoCandidate };
  }

  return { ok: false, reason: "Google Fit account not selected" };
}

function parseGrantedScopes(scopeValue) {
  const raw = String(scopeValue || "").trim();
  if (!raw) return [];
  // Google returns space-delimited scopes in the token response.
  return raw.split(/\s+/g).map((s) => s.trim()).filter(Boolean);
}

function hasRequiredScopes(grantedScopes, requiredScopes) {
  const granted = new Set((grantedScopes || []).map((s) => String(s)));
  for (const need of requiredScopes || []) {
    if (!granted.has(String(need))) {
      return false;
    }
  }
  return true;
}

async function fetchTokenInfoScopes(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) return null;

  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const scope = data && typeof data.scope === "string" ? data.scope : null;
    return scope || null;
  } catch (_error) {
    return null;
  }
}

async function startGoogleOAuth(userId, { purpose = null } = {}) {
  requireGoogleConfigured();

  // Opportunistic cleanup to keep nonce table bounded.
  await integrationModel.purgeOAuthStateNonces().catch(() => undefined);

  const nonce = createNonce(24, "oauth");
  const ttlMs = getOAuthStateTtlMs();
  const expiresAt = new Date(Date.now() + ttlMs);
  await integrationModel.saveOAuthStateNonce({ nonce, userId, expiresAt });

  const state = createOAuthStateToken({ userId, nonce, ttlMs });
  return getGoogleAuthUrl(state, { purpose });
}

async function completeGoogleOAuth(code, explicitUserId = null) {
  requireGoogleConfigured();

  const tokens = await getTokensFromCode(code);
  const tokenInfoScopes = tokens.access_token ? await fetchTokenInfoScopes(tokens.access_token) : null;
  const grantedScopes = tokens.scope ? String(tokens.scope) : tokenInfoScopes;
  const authClient = buildAuthedClient({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });

  const oauth2 = google.oauth2({ version: "v2", auth: authClient });
  const profile = await oauth2.userinfo.get();
  const googleId = profile.data.id || null;
  const googleEmail = profile.data.email || null;
  const googleName = profile.data.name || null;

  const userId = explicitUserId;
  if (!userId) {
    throw new Error("userId is required to persist Google tokens");
  }
  if (!googleId) {
    throw new Error("Google account id missing in OAuth profile");
  }

  await integrationModel.saveGoogleTokens(userId, {
    googleId,
    googleEmail,
    googleName,
    accessToken: encrypt(tokens.access_token || ""),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    grantedScopes,
    setPrimary: true
  });

  const accounts = await listConnectedGoogleAccounts(userId);
  return {
    userId,
    googleId,
    googleEmail,
    googleName,
    accountCount: accounts.length,
    accounts
  };
}

async function completeGoogleOAuthFromState(code, state) {
  const payload = verifyOAuthStateToken(state);
  const userId = payload.userId;
  const consumed = await integrationModel.consumeOAuthStateNonce({
    nonce: payload.nonce,
    userId
  });
  if (!consumed) {
    throw new Error("Invalid OAuth state");
  }

  return completeGoogleOAuth(code, userId);
}

async function buildUserGoogleClient(userId, accountId = null) {
  const tokens = accountId
    ? await integrationModel.getGoogleAccountById(userId, accountId)
    : await integrationModel.getUserGoogleTokens(userId);
  if (!tokens || !tokens.google_access_token) {
    return null;
  }

  try {
    const refreshToken = tokens.google_refresh_token ? decrypt(tokens.google_refresh_token) : null;
    return buildAuthedClient({
      accessToken: decrypt(tokens.google_access_token),
      refreshToken,
      tokenExpiry: tokens.google_token_expiry || null
    });
  } catch (_error) {
    return null;
  }
}

async function createCalendarEvent(userId, { title, eventType, eventDate, googleAccountId = null }) {
  const eventId = createId("cev");
  const normalizedDate = toIsoDate(eventDate);
  const pushResult = await pushCalendarEventToGoogle(userId, { title, eventDate: normalizedDate, googleAccountId });

  await integrationModel.createCalendarEventRecord({
    eventId,
    userId,
    eventDate: normalizedDate,
    eventType,
    title,
    googleEventId: pushResult.googleEventId,
    syncStatus: pushResult.syncStatus
  });

  return { eventId, googleEventId: pushResult.googleEventId, syncStatus: pushResult.syncStatus };
}

async function pushCalendarEventToGoogle(userId, { title, eventDate, googleAccountId = null }) {
  let googleEventId = null;
  let syncStatus = "pending";

  try {
    const tokenRow = googleAccountId
      ? await integrationModel.getGoogleAccountById(userId, googleAccountId)
      : await integrationModel.getUserGoogleTokens(userId);
    const targetAccountId = tokenRow?.account_id || googleAccountId || null;
    const authClient = await buildUserGoogleClient(userId, targetAccountId);

    if (authClient) {
      const calendar = google.calendar({ version: "v3", auth: authClient });
      const dateOnly = toIsoDate(eventDate);
      const hasDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateOnly);
      let requestBody;
      if (hasDateOnly) {
        const nextDay = new Date(`${dateOnly}T00:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        const yyyy = nextDay.getFullYear();
        const mm = String(nextDay.getMonth() + 1).padStart(2, "0");
        const dd = String(nextDay.getDate()).padStart(2, "0");
        requestBody = {
          summary: title,
          start: { date: dateOnly },
          end: { date: `${yyyy}-${mm}-${dd}` }
        };
      } else {
        const start = new Date(eventDate);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        requestBody = {
          summary: title,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() }
        };
      }

      const result = await calendar.events.insert({
        calendarId: "primary",
        requestBody
      });

      googleEventId = namespaceGoogleEventId(targetAccountId, result.data.id || null);
      syncStatus = googleEventId ? "synced" : "failed";
    }
  } catch (_error) {
    syncStatus = "failed";
  }

  return { googleEventId, syncStatus };
}

async function pushWorkoutToGoogleFit(userId, sessionId) {
  const session = await integrationModel.getWorkoutSessionById(sessionId, userId);

  if (!session) {
    throw new Error("Invalid session_id: workout session not found for user");
  }

  let syncStatus = "pending";
  let googleFitSessionId = null;
  let reason = null;

  try {
    const selection = await requireFitAccountSelection(userId);
    if (!selection.ok) {
      syncStatus = "failed";
      reason = selection.reason;
      await integrationModel.updateWorkoutGoogleSync(sessionId, { googleFitSessionId, syncStatus });
      return { sessionId, googleFitSessionId, syncStatus, reason };
    }
    const tokenRow = await integrationModel.getGoogleAccountById(userId, selection.accountId).catch(() => null);
    const granted = parseGrantedScopes(tokenRow?.granted_scopes || "");
    const writeScopes = ["https://www.googleapis.com/auth/fitness.activity.write"];
    if (!hasRequiredScopes(granted, writeScopes)) {
      syncStatus = "failed";
      reason = "Selected Google Fit account is missing activity write permission. Reconnect Fit and select it again.";
      await integrationModel.updateWorkoutGoogleSync(sessionId, { googleFitSessionId, syncStatus });
      return { sessionId, googleFitSessionId, syncStatus, reason };
    }

    const authClient = await buildUserGoogleClient(userId, selection.accountId);

    if (authClient) {
      const fitness = google.fitness({ version: "v1", auth: authClient });
      const workoutDateIso = toIsoDate(session.workout_date);
      const startTime = new Date(`${workoutDateIso}T06:00:00Z`);
      const endTime = new Date(startTime.getTime() + Number(session.duration_minutes || 30) * 60 * 1000);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        throw new Error("Invalid workout date/time while creating Google Fit session");
      }
      const calories = estimateWorkoutSessionCalories(session);
      const activityType = mapWorkoutSessionActivityType(session);
      const activityLabel = mapActivityTypeLabel(activityType);

      googleFitSessionId = `${session.session_id}`;

      await fitness.users.sessions.update({
        userId: "me",
        sessionId: googleFitSessionId,
        requestBody: {
          id: googleFitSessionId,
          name: `GAK ${activityLabel}`,
          description: `${session.muscle_group || "Workout"} | ${calories} kcal`,
          startTimeMillis: String(startTime.getTime()),
          endTimeMillis: String(endTime.getTime()),
          application: { name: "GAK", version: "1.0" },
          activityType
        }
      });
      await writeWorkoutFitDataPoints({
        fitness,
        startTimeMillis: startTime.getTime(),
        endTimeMillis: endTime.getTime(),
        calories,
        activityType
      });

      syncStatus = "synced";
      reason = null;
    } else {
      syncStatus = "failed";
      reason = "Unable to use selected Google Fit account token";
    }
  } catch (error) {
    syncStatus = "failed";
    reason = String(error?.message || "Google Fit sync failed");
  }

  await integrationModel.updateWorkoutGoogleSync(sessionId, { googleFitSessionId, syncStatus });

  return { sessionId, googleFitSessionId, syncStatus, reason };
}

function estimateWorkoutSessionCalories(session) {
  const explicit = Number(session?.calories_burned || 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number(explicit.toFixed(2));
  }
  const duration = Math.max(20, Number(session?.duration_minutes || 60));
  return Number(Math.max(120, Math.round(duration * 6)).toFixed(2));
}

function mapWorkoutSessionActivityType(session) {
  const text = `${String(session?.workout_type || "")} ${String(session?.muscle_group || "")}`.toLowerCase();
  if (/\b(yoga|stretch|mobility|pilates)\b/.test(text)) return 100;
  if (/\b(run|running|jog|sprint)\b/.test(text)) return 8;
  if (/\b(walk|walking)\b/.test(text)) return 7;
  if (/\b(cycle|cycling|bike)\b/.test(text)) return 1;
  if (/\b(swim|swimming)\b/.test(text)) return 82;
  if (/\b(weight|weights|lift|lifting|weightlifting)\b/.test(text)) return 97;
  // Default for gym plans and generic "strength" sessions.
  return 80;
}

function mapActivityTypeLabel(activityType) {
  const code = Number(activityType || 0);
  if (code === 97) return "Weightlifting";
  if (code === 100) return "Yoga";
  if (code === 8) return "Running";
  if (code === 7) return "Walking";
  if (code === 1) return "Cycling";
  if (code === 82) return "Swimming";
  return "Strength Training";
}

function toNanosString(ms) {
  const safe = Number(ms || 0);
  if (!Number.isFinite(safe) || safe <= 0) {
    return "0";
  }
  return `${Math.trunc(safe)}000000`;
}

function buildDatasetIdFromMillis(startTimeMillis, endTimeMillis) {
  return `${toNanosString(startTimeMillis)}-${toNanosString(endTimeMillis)}`;
}

async function ensureFitDataSource(fitness, { dataTypeName, streamName }) {
  const existing = await fitness.users.dataSources.list({
    userId: "me",
    dataTypeName
  }).catch(() => null);

  const existingSource = (existing?.data?.dataSource || []).find((source) => {
    if (!source) return false;
    const sourceName = String(source.dataStreamName || "");
    const sourceType = String(source.type || "").toLowerCase();
    return sourceName === streamName && sourceType === "raw";
  });

  if (existingSource?.dataStreamId) {
    return String(existingSource.dataStreamId);
  }

  try {
    const created = await fitness.users.dataSources.create({
      userId: "me",
      requestBody: {
        dataStreamName: streamName,
        type: "raw",
        dataType: { name: dataTypeName },
        application: { name: "GAK", version: "1.0" }
      }
    });
    if (created?.data?.dataStreamId) {
      return String(created.data.dataStreamId);
    }
  } catch (_error) {
    // Retry list path to handle races/409 when stream already exists.
  }

  const retried = await fitness.users.dataSources.list({
    userId: "me",
    dataTypeName
  }).catch(() => null);
  const matched = (retried?.data?.dataSource || []).find((source) => {
    if (!source) return false;
    return String(source.dataStreamName || "") === streamName && String(source.type || "").toLowerCase() === "raw";
  });

  if (!matched?.dataStreamId) {
    throw new Error(`Unable to create Google Fit data source for ${dataTypeName}`);
  }

  return String(matched.dataStreamId);
}

async function upsertFitDatasetPoint({
  fitness,
  dataSourceId,
  dataTypeName,
  startTimeMillis,
  endTimeMillis,
  values
}) {
  const startNanos = toNanosString(startTimeMillis);
  const endNanos = toNanosString(endTimeMillis);
  const datasetId = buildDatasetIdFromMillis(startTimeMillis, endTimeMillis);

  await fitness.users.dataSources.datasets.patch({
    userId: "me",
    dataSourceId,
    datasetId,
    requestBody: {
      dataSourceId,
      minStartTimeNs: startNanos,
      maxEndTimeNs: endNanos,
      point: [
        {
          dataTypeName,
          startTimeNanos: startNanos,
          endTimeNanos: endNanos,
          value: values
        }
      ]
    }
  });
}

async function writeWorkoutFitDataPoints({
  fitness,
  startTimeMillis,
  endTimeMillis,
  calories,
  activityType
}) {
  const clampedCalories = Number(Number(calories || 0).toFixed(2));
  if (!Number.isFinite(clampedCalories) || clampedCalories <= 0) {
    throw new Error("Workout calories are required to write Google Fit activity data");
  }

  const caloriesSourceId = await ensureFitDataSource(fitness, {
    dataTypeName: "com.google.calories.expended",
    streamName: "gak_workout_calories"
  });
  const activitySourceId = await ensureFitDataSource(fitness, {
    dataTypeName: "com.google.activity.segment",
    streamName: "gak_workout_segments"
  });

  await upsertFitDatasetPoint({
    fitness,
    dataSourceId: caloriesSourceId,
    dataTypeName: "com.google.calories.expended",
    startTimeMillis,
    endTimeMillis,
    values: [{ fpVal: clampedCalories }]
  });

  await upsertFitDatasetPoint({
    fitness,
    dataSourceId: activitySourceId,
    dataTypeName: "com.google.activity.segment",
    startTimeMillis,
    endTimeMillis,
    values: [{ intVal: Number.isFinite(Number(activityType)) ? Number(activityType) : 8 }]
  });
}

async function parseGmailForAcademicEvents(userId, { accountId = null } = {}) {
  const parseStartedAt = Date.now();
  await integrationModel.purgeStaleAcademicDeadlines(userId).catch(() => undefined);
  const deletedCompletedSourcesBefore = await integrationModel.purgeCompletedAcademicEnrollments(userId).catch(() => 0);
  const allAccounts = await integrationModel.listUserGoogleAccountsWithTokens(userId);
  const accounts = accountId
    ? allAccounts.filter((row) => row.account_id === accountId)
    : allAccounts;
  if (!accounts.length) {
    return { processed: 0, createdEvents: 0, reason: "Google account not connected", accounts: [] };
  }

  let processed = 0;
  let createdEvents = 0;
  const accountResults = [];

  for (const account of accounts) {
    const accountStart = Date.now();
    const summary = {
      accountId: account.account_id,
      email: account.google_email || null,
      processed: 0,
      createdEvents: 0,
      skippedNoise: 0,
      skippedNoDueDate: 0,
      skippedPastDue: 0,
      skippedUnregistered: 0,
      reconciledCalendarDates: 0,
      status: "ok",
      error: null,
      parseMs: 0
    };

    try {
      if (account.granted_scopes && !String(account.granted_scopes).includes("https://www.googleapis.com/auth/gmail.readonly")) {
        summary.status = "skipped";
        summary.error = "Missing Gmail permission (connect a Google account for Calendar/Gmail).";
        accountResults.push(summary);
        continue;
      }

      const authClient = await buildUserGoogleClient(userId, account.account_id);
      if (!authClient) {
        summary.status = "skipped";
        summary.error = "Missing or unreadable token";
        accountResults.push(summary);
        continue;
      }

      const gmail = google.gmail({ version: "v1", auth: authClient });
      // Keep search broad enough to include classroom/nptel variants, then enforce strict content filtering below.
      const q = [
        "newer_than:180d",
        "(",
        "from:(classroom.google.com OR no-reply@classroom.google.com OR noreply@classroom.google.com OR nptel OR study.iitm OR srmist.edu.in OR coursera OR udemy OR devpost OR unstop OR kaggle)",
        "OR",
        "subject:(assignment OR deadline OR due OR exam OR quiz OR internal OR registration OR \"exam registration\" OR classroom OR nptel OR coursera OR udemy OR hackathon)",
        ")"
      ].join(" ");
      const list = await gmail.users.messages.list({ userId: "me", q, maxResults: 100 });
      const messageIds = (list.data.messages || []).map((item) => item.id).filter(Boolean);
      const allowCalendarWrite = String(process.env.GMAIL_AUTO_CREATE_CALENDAR_EVENTS || "false").toLowerCase() === "true";

      for (const id of messageIds) {
        const details = await gmail.users.messages.get({ userId: "me", id, format: "full" });
        const headers = details.data.payload?.headers || [];
        const subject = headers.find((h) => String(h.name).toLowerCase() === "subject")?.value || "";
        const from = headers.find((h) => String(h.name).toLowerCase() === "from")?.value || "";
        const headerDateText = headers.find((h) => String(h.name).toLowerCase() === "date")?.value || "";
        const snippet = details.data.snippet || "";
        const bodyText = extractGmailMessageText(details.data.payload) || "";
        const internalDateMs = Number(details?.data?.internalDate || 0);
        const referenceDate = Number.isFinite(internalDateMs) && internalDateMs > 0
          ? new Date(internalDateMs)
          : (headerDateText ? new Date(headerDateText) : new Date());
        const source = deriveAcademicSource({ subject, snippet, bodyText, from });
        if (!source) {
          continue;
        }
        const analyzer = analyzeAcademicEmail({ subject, snippet, bodyText, from, referenceDate });
        const allowRegisteredHackathonPromo = source.providerCode === "hackathon" && source.registrationSignal;
        if (!analyzer.relevant && !isRelevantAcademicEmail(`${subject} ${snippet} ${bodyText}`, from) && !allowRegisteredHackathonPromo) {
          continue;
        }

        summary.processed += 1;
        processed += 1;

        const parsedDeadline = analyzer.parsedDeadline || extractDeadline(`${subject}\n${snippet}\n${bodyText}`, referenceDate);
        const normalizedSubject = buildAcademicDeadlineTitle({ subject, snippet, bodyText, source });
        const likelyDeadlineTitle = isLikelyAcademicDeadlineTitle(normalizedSubject);
        if (analyzer.hasPromo && !allowRegisteredHackathonPromo) {
          summary.skippedNoise += 1;
          continue;
        }
        if (!likelyDeadlineTitle && !analyzer.hasPlatform && source.providerCode !== "hackathon") {
          summary.skippedNoise += 1;
          continue;
        }
        if (!parsedDeadline && !source.registrationSignal && !source.completionSignal) {
          summary.skippedNoDueDate += 1;
          continue;
        }

        const dueDate = parsedDeadline ? new Date(parsedDeadline) : null;
        const hasValidDueDate = Boolean(dueDate && !Number.isNaN(dueDate.getTime()));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isUpcoming = hasValidDueDate ? dueDate >= today : false;

        const enrollment = await integrationModel.upsertAcademicEnrollment(userId, {
          providerCode: source.providerCode,
          sourceType: source.sourceType,
          sourceKey: source.sourceKey,
          sourceName: source.sourceName,
          senderEmail: source.senderEmail,
          registrationSignal: source.registrationSignal,
          completionSignal: source.completionSignal,
          parsedDeadline: hasValidDueDate ? dueDate : null
        });
        if (!enrollment) {
          continue;
        }
        const isRegisteredSource = Number(enrollment.is_registered || 0) === 1;
        const isActiveSource = String(enrollment.status || "active") === "active";
        if (!isRegisteredSource || !isActiveSource) {
          summary.skippedUnregistered += 1;
          continue;
        }
        const sourceAccountEmail = account.google_email || account.google_id || account.account_id;
        const existing = await integrationModel.getEmailEventByMessage({
          userId,
          sourceAccountEmail,
          sourceMessageId: id
        });
        if (hasValidDueDate && existing?.subject && String(existing.subject) !== String(normalizedSubject)) {
          const retitled = await integrationModel.reconcileAcademicCalendarEventTitleByDate({
            userId,
            oldTitle: existing.subject,
            newTitle: normalizedSubject,
            eventDate: dueDate
          }).catch(() => 0);
          summary.reconciledCalendarDates += Number(retitled || 0);
        }

        if (hasValidDueDate) {
          await integrationModel.createEmailEvent({
            id: createId("eml"),
            userId,
            subject: normalizedSubject,
            parsedDeadline: dueDate,
            confidenceScore: Number((analyzer.confidence || (parsedDeadline ? 0.8 : 0.5)).toFixed(2)),
            sourceMessageId: id,
            sourceAccountEmail
          });
          const reconciled = await integrationModel.reconcileAcademicCalendarEventDateByTitle({
            userId,
            title: normalizedSubject,
            eventDate: dueDate
          }).catch(() => 0);
          summary.reconciledCalendarDates += Number(reconciled || 0);
        }

        if (!hasValidDueDate) {
          summary.skippedNoDueDate += 1;
          continue;
        }
        if (!isUpcoming) {
          summary.skippedPastDue += 1;
          continue;
        }

        const alreadyHadDeadline = Boolean(existing && existing.parsed_deadline);
        const shouldCreateCalendar = allowCalendarWrite
          && dueDate
          && likelyDeadlineTitle
          && !alreadyHadDeadline
          && Number(analyzer.confidence || 0) >= 0.85
          && (analyzer.senderAcademic || analyzer.hasPlatform);
        if (shouldCreateCalendar) {
          await createCalendarEvent(userId, {
            title: normalizedSubject,
            eventType: "academic",
            eventDate: dueDate,
            googleAccountId: account.account_id
          });
          summary.createdEvents += 1;
          createdEvents += 1;
        }
      }
    } catch (error) {
      summary.status = "failed";
      summary.error = String(error?.message || "gmail parse failed");
    }
    summary.parseMs = Date.now() - accountStart;

    accountResults.push(summary);
  }

  const deletedCompletedSources = await integrationModel.purgeCompletedAcademicEnrollments(userId).catch(() => 0);
  const staleCleanup = await integrationModel.purgeStaleAcademicDeadlines(userId).catch(() => ({
    emailDeleted: 0,
    calendarDeleted: 0
  }));

  return {
    processed,
    createdEvents,
    accounts: accountResults,
    accountCount: accountResults.length,
    cleanup: {
      deletedCompletedSources: Number(deletedCompletedSourcesBefore || 0) + Number(deletedCompletedSources || 0),
      staleDeadlinesDeleted: staleCleanup
    },
    parseMs: Date.now() - parseStartedAt
  };
}

function sumDatasetInt(dataset) {
  const points = dataset?.point || [];
  let sum = 0;
  for (const p of points) {
    for (const v of p.value || []) {
      if (typeof v.intVal === "number") {
        sum += v.intVal;
      }
    }
  }
  return sum;
}

function sumDatasetFloat(dataset) {
  const points = dataset?.point || [];
  let sum = 0;
  for (const p of points) {
    for (const v of p.value || []) {
      if (typeof v.fpVal === "number") {
        sum += v.fpVal;
      }
    }
  }
  return sum;
}

function avgDatasetFloat(dataset) {
  const points = dataset?.point || [];
  let sum = 0;
  let count = 0;
  for (const p of points) {
    for (const v of p.value || []) {
      if (typeof v.fpVal === "number") {
        sum += v.fpVal;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : null;
}

function getCurrentDateInIst() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getCurrentHourInIst() {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false
  }).format(new Date());
  const hour = Number(value);
  return Number.isFinite(hour) ? hour : 0;
}

function readNumericFromFitValue(value) {
  if (value && typeof value.fpVal === "number" && Number.isFinite(value.fpVal)) {
    return Number(value.fpVal);
  }
  if (value && typeof value.intVal === "number" && Number.isFinite(value.intVal)) {
    return Number(value.intVal);
  }
  return null;
}

function pickLatestPositiveFromBuckets(buckets) {
  let latest = null;
  for (const bucket of buckets || []) {
    const datasets = bucket?.dataset || [];
    const bucketEndNanos = Number(String(bucket?.endTimeMillis || "0")) * 1_000_000;
    for (const ds of datasets) {
      for (const point of ds?.point || []) {
        const pointEnd = Number(String(point?.endTimeNanos || "0"));
        const pointStart = Number(String(point?.startTimeNanos || "0"));
        const pointTime = Number.isFinite(pointEnd) && pointEnd > 0
          ? pointEnd
          : Number.isFinite(pointStart) && pointStart > 0
            ? pointStart
            : bucketEndNanos;

        for (const raw of point?.value || []) {
          const numeric = readNumericFromFitValue(raw);
          if (numeric === null || numeric <= 0) continue;
          if (!latest || pointTime > latest.pointTime) {
            latest = { value: numeric, pointTime };
          }
        }
      }
    }
  }
  return latest ? Number(latest.value) : null;
}

async function aggregateLatestMetricByWindows(fitness, dataTypeName, {
  endMillis,
  lookbackDays = 365,
  windowDays = 30,
  warnings = null
} = {}) {
  const safeEnd = Number.isFinite(Number(endMillis)) ? Number(endMillis) : Date.now();
  const lookbackMs = Math.max(1, Number(lookbackDays || 365)) * 24 * 60 * 60 * 1000;
  const windowMs = Math.max(1, Number(windowDays || 30)) * 24 * 60 * 60 * 1000;
  const lowerBound = safeEnd - lookbackMs;

  for (let cursorEnd = safeEnd; cursorEnd > lowerBound; cursorEnd -= windowMs) {
    const cursorStart = Math.max(lowerBound, cursorEnd - windowMs);
    try {
      const resp = await fitness.users.dataset.aggregate({
        userId: "me",
        requestBody: {
          aggregateBy: [{ dataTypeName }],
          bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
          startTimeMillis: String(cursorStart),
          endTimeMillis: String(cursorEnd)
        }
      });
      const buckets = resp?.data?.bucket || [];
      const latest = pickLatestPositiveFromBuckets(buckets);
      if (latest !== null) {
        return latest;
      }
    } catch (error) {
      const status = error?.code || error?.response?.status || null;
      const reason = String(error?.response?.data?.error?.message || error?.message || "Google Fit body metric failed");
      if (Array.isArray(warnings)) {
        warnings.push(status ? `${dataTypeName}: ${reason} (HTTP ${status})` : `${dataTypeName}: ${reason}`);
      }
    }
  }

  return null;
}

async function syncGoogleFitBodyMetrics(userId) {
  const selection = await requireFitAccountSelection(userId);
  if (!selection.ok) {
    return { connected: false, height: null, weight: null, reason: selection.reason };
  }

  const tokenRow = await integrationModel.getGoogleAccountById(userId, selection.accountId).catch(() => null);
  if (tokenRow && !tokenRow.google_refresh_token) {
    return {
      connected: false,
      height: null,
      weight: null,
      reason: "Selected Google Fit account is missing a refresh token. Reconnect Google Fit with consent."
    };
  }

  const authClient = await buildUserGoogleClient(userId, selection.accountId);
  if (!authClient) {
    return {
      connected: false,
      height: null,
      weight: null,
      reason: "Unable to use selected Google Fit account token"
    };
  }

  const fitness = google.fitness({ version: "v1", auth: authClient });
  const endMillis = Date.now();
  const warnings = [];

  const weight = await aggregateLatestMetricByWindows(fitness, "com.google.weight", { endMillis, warnings });
  const height = await aggregateLatestMetricByWindows(fitness, "com.google.height", { endMillis, warnings });
  const existing = await fitModel.getLatestBodyMetric(userId).catch(() => null);

  if (weight === null && height === null) {
    if (existing && (existing.height !== null || existing.weight !== null)) {
      return {
        connected: true,
        height: existing.height === null || existing.height === undefined ? null : Number(existing.height),
        weight: existing.weight === null || existing.weight === undefined ? null : Number(existing.weight),
        warning: warnings.length ? warnings.join("; ") : null
      };
    }
    return {
      connected: false,
      height: null,
      weight: null,
      reason: warnings[0] || "No Google Fit body metrics found"
    };
  }

  await fitModel.upsertLatestBodyMetric({ userId, height, weight });
  const latest = await fitModel.getLatestBodyMetric(userId).catch(() => null);
  return {
    connected: true,
    height: latest?.height === null || latest?.height === undefined ? (height ?? null) : Number(latest.height),
    weight: latest?.weight === null || latest?.weight === undefined ? (weight ?? null) : Number(latest.weight),
    warning: warnings.length ? warnings.join("; ") : null
  };
}

async function aggregateGoogleFitDataType(fitness, { startMillis, endMillis, dataTypeName }) {
  const resp = await fitness.users.dataset.aggregate({
    userId: "me",
    requestBody: {
      aggregateBy: [{ dataTypeName }],
      bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
      startTimeMillis: String(startMillis),
      endTimeMillis: String(endMillis)
    }
  });
  const bucket = resp?.data?.bucket?.[0];
  return (bucket?.dataset || [])[0] || null;
}

async function syncGoogleFitDailyMetrics(userId, date) {
  const selection = await requireFitAccountSelection(userId);
  if (!selection.ok) {
    return { connected: false, date, steps: null, calories: null, heartRateAvg: null, reason: selection.reason };
  }

  const tokenRow = await integrationModel.getGoogleAccountById(userId, selection.accountId).catch(() => null);
  if (tokenRow && !tokenRow.google_refresh_token) {
    return {
      connected: false,
      date,
      steps: null,
      calories: null,
      heartRateAvg: null,
      reason: "Selected Google Fit account is missing a refresh token. Reconnect Google Fit with consent."
    };
  }

  const authClient = await buildUserGoogleClient(userId, selection.accountId);
  if (!authClient) {
    return {
      connected: false,
      date,
      steps: null,
      calories: null,
      heartRateAvg: null,
      reason: "Unable to use selected Google Fit account token"
    };
  }

  const start = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(date).slice(0, 10)}T23:59:59`);
  const startMillis = start.getTime();
  const endMillis = end.getTime();

  const fitness = google.fitness({ version: "v1", auth: authClient });

  const warnings = [];
  const loadMetric = async (dataTypeName, parser) => {
    try {
      const dataset = await aggregateGoogleFitDataType(fitness, { startMillis, endMillis, dataTypeName });
      return parser(dataset);
    } catch (error) {
      const status = error?.code || error?.response?.status || null;
      const reason = String(error?.response?.data?.error?.message || error?.message || "Google Fit metric failed");
      warnings.push(status ? `${dataTypeName}: ${reason} (HTTP ${status})` : `${dataTypeName}: ${reason}`);
      return null;
    }
  };

  const steps = await loadMetric("com.google.step_count.delta", (dataset) => (dataset ? sumDatasetInt(dataset) : null));
  const calories = await loadMetric("com.google.calories.expended", (dataset) => (dataset ? Number(sumDatasetFloat(dataset).toFixed(2)) : null));
  const heartRateAvg = await loadMetric("com.google.heart_rate.bpm", (dataset) => (dataset ? avgDatasetFloat(dataset) : null));

  const hasAnyMetric = [steps, calories, heartRateAvg].some((v) => v !== null && v !== undefined);
  if (!hasAnyMetric) {
    return {
      connected: true,
      date: String(date).slice(0, 10),
      steps: null,
      calories: null,
      heartRateAvg: null,
      reason: warnings[0] || "Google Fit aggregate failed"
    };
  }

  await fitModel.upsertDailyFitMetrics({
    userId,
    metricDate: String(date).slice(0, 10),
    steps,
    calories,
    heartRateAvg: heartRateAvg === null ? null : Number(heartRateAvg.toFixed(2))
  });

  // Best-effort body metrics sync for Karma "Body Metrics" card (non-blocking).
  void syncGoogleFitBodyMetrics(userId).catch(() => null);

  return {
    connected: true,
    date: String(date).slice(0, 10),
    steps,
    calories,
    heartRateAvg,
    warning: warnings.length ? warnings.join("; ") : null
  };
}

function parseSessionCaloriesFromDescription(description) {
  const text = String(description || "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*kcal/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function formatGoogleSessionTime(value) {
  if (!value) return null;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

async function listGoogleFitActivities(userId, { fromDate, toDate, limit = 20 } = {}) {
  const selection = await requireFitAccountSelection(userId);
  if (!selection.ok) {
    return { connected: false, fromDate: null, toDate: null, rows: [], reason: selection.reason };
  }

  const authClient = await buildUserGoogleClient(userId, selection.accountId);
  if (!authClient) {
    return { connected: false, fromDate: null, toDate: null, rows: [], reason: "Unable to use selected Google Fit account token" };
  }

  const from = String(fromDate || "").slice(0, 10);
  const to = String(toDate || "").slice(0, 10);
  const today = getCurrentDateInIst();
  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
  const requestedLimit = Number(limit || 20);
  const safeLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 20;

  const startIso = new Date(`${safeFrom}T00:00:00.000Z`).toISOString();
  const endIso = new Date(`${safeTo}T23:59:59.999Z`).toISOString();
  const fitness = google.fitness({ version: "v1", auth: authClient });

  try {
    const resp = await fitness.users.sessions.list({
      userId: "me",
      startTime: startIso,
      endTime: endIso,
      includeDeleted: false
    });
    const sessions = Array.isArray(resp?.data?.session) ? resp.data.session : [];
    const rows = sessions
      .map((session) => {
        const startTime = formatGoogleSessionTime(session?.startTimeMillis);
        const endTime = formatGoogleSessionTime(session?.endTimeMillis);
        const startMs = Number(session?.startTimeMillis || 0);
        const endMs = Number(session?.endTimeMillis || 0);
        const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
          ? Math.max(1, Math.round((endMs - startMs) / 60000))
          : null;
        return {
          sessionId: session?.id || null,
          title: String(session?.name || "Workout"),
          description: String(session?.description || ""),
          source: String(session?.application?.name || "").toLowerCase() === "gak" ? "gak" : "google_fit",
          activityType: session?.activityType ?? null,
          calories: parseSessionCaloriesFromDescription(session?.description),
          startTime,
          endTime,
          durationMinutes
        };
      })
      .filter((row) => row.startTime)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, safeLimit);

    return { connected: true, fromDate: safeFrom, toDate: safeTo, rows };
  } catch (error) {
    return {
      connected: false,
      fromDate: safeFrom,
      toDate: safeTo,
      rows: [],
      reason: String(error?.response?.data?.error?.message || error?.message || "Google Fit activity sync failed")
    };
  }
}

async function applyWorkoutCaloriesFallbackToFitDaily(userId, date) {
  const metricDate = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) {
    return { applied: false, reason: "invalid_date" };
  }

  const totalWorkoutCalories = await integrationModel.getCompletedWorkoutCaloriesForDate(userId, metricDate).catch(() => 0);
  if (!Number.isFinite(totalWorkoutCalories) || totalWorkoutCalories <= 0) {
    return { applied: false, reason: "no_workout_calories" };
  }
  const roundedWorkoutCalories = Number(Number(totalWorkoutCalories).toFixed(2));

  const existing = await fitModel.getDailyFitMetrics(userId, metricDate).catch(() => null);
  const existingCalories = existing?.calories === null || existing?.calories === undefined ? null : Number(existing.calories);
  const effectiveCalories = Math.max(Number.isFinite(existingCalories) ? Number(existingCalories) : 0, roundedWorkoutCalories);
  if (Number.isFinite(existingCalories) && Number(existingCalories) >= effectiveCalories) {
    return { applied: false, reason: "fit_calories_higher", calories: Number(existingCalories) };
  }

  await fitModel.upsertDailyFitMetrics({
    userId,
    metricDate,
    steps: existing?.steps === null || existing?.steps === undefined ? null : Number(existing.steps),
    calories: effectiveCalories,
    heartRateAvg: existing?.heart_rate_avg === null || existing?.heart_rate_avg === undefined ? null : Number(existing.heart_rate_avg)
  });

  return { applied: true, calories: effectiveCalories };
}

function toIsoDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return raw.slice(0, 10);
}

function namespaceGoogleEventId(accountId, googleEventId) {
  const account = String(accountId || "").trim();
  const eventId = String(googleEventId || "").trim();
  if (!eventId) return null;
  if (!account) return eventId;
  return eventId.startsWith(`${account}:`) ? eventId : `${account}:${eventId}`;
}

function normalizeCalendarTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim()
    .slice(0, 255) || "Calendar event";
}

function inferCalendarEventTypeFromContent({ title = "", description = "" } = {}) {
  const text = `${String(title || "")}\n${String(description || "")}`.toLowerCase();
  if (!text.trim()) return "personal";

  if (/\b(workout|gym|strength|cardio|run|jog|walk|yoga|exercise|training|fitness|pre-workout|post-workout)\b/.test(text)) {
    return "fitness";
  }
  if (/\b(meal|breakfast|lunch|dinner|snack|diet|nutrition|calorie|protein|hydration)\b/.test(text)) {
    return "nutrition";
  }
  if (/\b(nptel|classroom|google classroom|assignment|submission|deadline|due|quiz|test|internal|midsem|endsem|exam|viva|project|lab|practical|course|subject|semester|lecture|attendance|exam registration|register by|closes on|ft-i|ft-ii)\b/.test(text)) {
    return "academic";
  }
  return "personal";
}

function safeDateOnlyFromGoogleStart(start) {
  const allDay = start && typeof start.date === "string" ? start.date : null;
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(allDay)) return allDay;

  const dt = start && typeof start.dateTime === "string" ? start.dateTime : null;
  if (dt) {
    const rawDate = dt.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
    const parsed = new Date(dt);
    if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);
  }

  return null;
}

async function syncGoogleCalendarEvents(userId, { daysBack = 7, daysForward = 180 } = {}) {
  const allAccounts = await integrationModel.listUserGoogleAccountsWithTokens(userId);
  if (!allAccounts.length) {
    return { synced: 0, skipped: 0, failed: 0, reason: "Google account not connected", accounts: [] };
  }

  const required = getScopesForPurpose("calendar_gmail").filter((s) => !["openid", "email", "profile"].includes(String(s)));
  const from = new Date();
  from.setDate(from.getDate() - Number(daysBack || 0));
  const to = new Date();
  to.setDate(to.getDate() + Number(daysForward || 0));

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const accountResults = [];

  for (const account of allAccounts) {
    const summary = { accountId: account.account_id, email: account.google_email || null, synced: 0, skipped: 0, status: "ok", error: null };
    try {
      if (account.granted_scopes) {
        const granted = String(account.granted_scopes).split(/\s+/g);
        if (!hasRequiredScopes(granted, required.filter((s) => s.includes("calendar")))) {
          summary.status = "skipped";
          summary.error = "Missing Calendar permission (connect a Google account for Calendar/Gmail).";
          skipped += 1;
          accountResults.push(summary);
          continue;
        }
      }

      const authClient = await buildUserGoogleClient(userId, account.account_id);
      if (!authClient) {
        summary.status = "skipped";
        summary.error = "Missing or unreadable token";
        skipped += 1;
        accountResults.push(summary);
        continue;
      }

      const calendar = google.calendar({ version: "v3", auth: authClient });
      const resp = await calendar.events.list({
        calendarId: "primary",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
        timeMin: from.toISOString(),
        timeMax: to.toISOString()
      });

      const items = Array.isArray(resp.data.items) ? resp.data.items : [];
      for (const ev of items) {
        const googleIdRaw = ev && typeof ev.id === "string" ? ev.id : null;
        const title = normalizeCalendarTitle(ev?.summary || ev?.description || "Calendar event");
        const description = normalizeCalendarTitle(ev?.description || "");
        const dateOnly = safeDateOnlyFromGoogleStart(ev?.start);
        if (!googleIdRaw || !dateOnly) continue;

        // Namespace to avoid collisions across linked accounts.
        const namespacedGoogleId = namespaceGoogleEventId(account.account_id, googleIdRaw);
        const eventType = inferCalendarEventTypeFromContent({ title, description });
        await integrationModel.normalizeCalendarGoogleEventIdNamespace({
          userId,
          rawGoogleEventId: googleIdRaw,
          namespacedGoogleEventId: namespacedGoogleId
        }).catch(() => undefined);
        await integrationModel.upsertCalendarEventByGoogleId({
          userId,
          googleEventId: namespacedGoogleId,
          eventDate: toIsoDate(dateOnly),
          eventType,
          title,
          syncStatus: "synced"
        });
        summary.synced += 1;
        synced += 1;
      }
    } catch (error) {
      summary.status = "failed";
      summary.error = String(error?.response?.data?.error?.message || error?.message || "calendar sync failed");
      failed += 1;
    }

    accountResults.push(summary);
  }

  return { synced, skipped, failed, from: from.toISOString(), to: to.toISOString(), accounts: accountResults };
}

async function getFitDailyMetrics(userId, date) {
  const metricDate = String(date).slice(0, 10);
  const selection = await requireFitAccountSelection(userId);
  if (!selection.ok) {
    return { connected: false, date: metricDate, steps: null, calories: null, heartRateAvg: null, reason: selection.reason };
  }

  const cached = await fitModel.getDailyFitMetrics(userId, metricDate);
  if (cached) {
    const todayIst = getCurrentDateInIst();
    const cachedUpdatedAt = cached.updated_at ? new Date(cached.updated_at) : null;
    const ageMs = cachedUpdatedAt && !Number.isNaN(cachedUpdatedAt.getTime())
      ? Date.now() - cachedUpdatedAt.getTime()
      : Number.POSITIVE_INFINITY;
    const refreshIntervalMs = Math.max(5 * 60 * 1000, Number(process.env.FIT_TODAY_REFRESH_MS || 5 * 60 * 1000));
    const currentIstHour = getCurrentHourInIst();
    const staleTodayCache = metricDate === todayIst && ageMs > refreshIntervalMs;
    const suspiciousZeroToday = (
      metricDate === todayIst
      && currentIstHour >= 8
      && Number(cached.steps || 0) === 0
      && Number(cached.calories || 0) === 0
      && (cached.heart_rate_avg === null || cached.heart_rate_avg === undefined)
    );
    const suspiciousLowToday = (
      metricDate === todayIst
      && currentIstHour >= 18
      && Number(cached.steps || 0) <= 100
      && Number(cached.calories || 0) <= 250
    );
    if (staleTodayCache || suspiciousZeroToday || suspiciousLowToday) {
      try {
        return await syncGoogleFitDailyMetrics(userId, metricDate);
      } catch (_error) {
        // Fall through to cached values when refresh fails.
      }
    }
    return {
      connected: true,
      date: metricDate,
      steps: cached.steps === null ? null : Number(cached.steps),
      calories: cached.calories === null ? null : Number(cached.calories),
      heartRateAvg: cached.heart_rate_avg === null ? null : Number(cached.heart_rate_avg)
    };
  }

  // No cached record yet: fetch and persist.
  try {
    return await syncGoogleFitDailyMetrics(userId, metricDate);
  } catch (error) {
    return {
      connected: false,
      date: metricDate,
      steps: null,
      calories: null,
      heartRateAvg: null,
      reason: String(error?.message || "Google Fit sync failed")
    };
  }
}

async function listFitMetricsRange(userId, fromDate) {
  const from = String(fromDate).slice(0, 10);
  const todayIst = getCurrentDateInIst();
  if (from <= todayIst) {
    await getFitDailyMetrics(userId, todayIst).catch(() => null);
  }
  return fitModel.listFitMetricsRange(userId, from);
}

async function syncPendingCalendarEvents() {
  const pending = await integrationModel.listPendingCalendarEvents();
  let synced = 0;

  for (const event of pending) {
    try {
      const result = await pushCalendarEventToGoogle(event.user_id, {
        title: event.title,
        eventDate: event.event_date
      });

      await integrationModel.updateCalendarEventSync(event.event_id, {
        googleEventId: result.googleEventId,
        syncStatus: result.syncStatus
      });

      if (result.syncStatus === "synced") {
        synced += 1;
      }
    } catch (_error) {
      await integrationModel.updateCalendarEventSync(event.event_id, {
        googleEventId: null,
        syncStatus: "failed"
      });
    }
  }

  return { pending: pending.length, synced };
}

async function getCalendarEvents(userId) {
  return integrationModel.listCalendarEventsByUser(userId);
}

async function getIntegrationStatus(userId) {
  const [googleAccounts, academia, fitSelection] = await Promise.all([
    listConnectedGoogleAccounts(userId),
    integrationModel.getAcademiaAccount(userId),
    getFitAccountSelection(userId)
  ]);
  const googleConfigValid = isGoogleConfigured();
  const primaryAccount = googleAccounts.find((row) => row.isPrimary) || googleAccounts[0] || null;
  const taggedAcademiaError = parseTaggedAcademiaError(academia?.last_error || null);

  return {
    googleConfigValid,
    googleConnected: googleAccounts.length > 0,
    tokenExpiry: primaryAccount?.tokenExpiry || null,
    googleAccountCount: googleAccounts.length,
    primaryGoogleAccountId: primaryAccount?.accountId || null,
    googleAccounts,
    fitGoogleAccountId: fitSelection.accountId || null,
    fitGoogleAccountEmail: fitSelection.account?.email || null,
    fitGoogleAccountLocked: Boolean(fitSelection.accountId),
    academiaConnected: Boolean(academia && academia.status === "connected"),
    academiaEmail: academia?.college_email || null,
    academiaLastSyncedAt: academia?.last_synced_at || null,
    academiaLastError: taggedAcademiaError.message || null,
    academiaSyncState: getAcademiaSyncStateFromAccount(academia || null)
  };
}

async function listGoogleAccounts(userId) {
  const accounts = await listConnectedGoogleAccounts(userId);
  const primaryAccount = accounts.find((row) => row.isPrimary) || accounts[0] || null;
  const fitSelection = await getFitAccountSelection(userId);
  return {
    accountCount: accounts.length,
    primaryGoogleAccountId: primaryAccount?.accountId || null,
    fitGoogleAccountId: fitSelection.accountId || null,
    fitGoogleAccountEmail: fitSelection.account?.email || null,
    fitGoogleAccountLocked: Boolean(fitSelection.accountId),
    accounts
  };
}

async function setPrimaryGoogleAccount(userId, accountId) {
  const ok = await integrationModel.setPrimaryGoogleAccount(userId, accountId);
  if (!ok) {
    throw new Error("Google account not found");
  }
  return listGoogleAccounts(userId);
}

async function disconnectGoogleAccount(userId, accountId) {
  const fitAccountId = await integrationModel.getFitGoogleAccountId(userId);
  if (fitAccountId && fitAccountId === accountId) {
    throw new Error("Selected Google Fit account is locked and cannot be removed");
  }

  const ok = await integrationModel.removeGoogleAccount(userId, accountId);
  if (!ok) {
    throw new Error("Google account not found");
  }
  return listGoogleAccounts(userId);
}

async function setFitGoogleAccount(userId, accountId) {
  const cleanAccountId = String(accountId || "").trim();
  if (!cleanAccountId) {
    throw new Error("Google account id is required");
  }

  const existing = await integrationModel.getFitGoogleAccountId(userId);
  if (existing) {
    throw new Error("Google Fit account is already selected and locked");
  }

  const account = await integrationModel.getGoogleAccountById(userId, cleanAccountId);
  if (!account) {
    throw new Error("Google account not found");
  }

  // Ensure the chosen account actually granted Fit scopes; otherwise syncing will always fail.
  const requiredFitScopes = getScopesForPurpose("fit").filter((s) => !String(s).startsWith("openid") && s !== "email" && s !== "profile");
  let grantedScopesRaw = account.granted_scopes || null;
  if (!grantedScopesRaw && account.google_access_token) {
    // Backfill scopes for older accounts that were connected before we started persisting them.
    try {
      const accessToken = decrypt(account.google_access_token);
      grantedScopesRaw = await fetchTokenInfoScopes(accessToken);
      if (grantedScopesRaw) {
        await integrationModel.updateGoogleAccountScopes(userId, cleanAccountId, grantedScopesRaw).catch(() => undefined);
      }
    } catch (_error) {
      // If we can't read scopes, we'll fail safe below.
      grantedScopesRaw = null;
    }
  }

  const granted = parseGrantedScopes(grantedScopesRaw);
  if (!hasRequiredScopes(granted, requiredFitScopes)) {
    throw new Error("Selected Google account is missing Google Fit permissions. Connect that account using the Google Fit connect flow first.");
  }

  const saved = await integrationModel.setFitGoogleAccountSelectionOnce(userId, cleanAccountId);
  if (!saved) {
    throw new Error("Google Fit account is already selected and locked");
  }

  return listGoogleAccounts(userId);
}

function academiaLog(userId, phase, details = {}) {
  // Structured logs; never include credentials/tokens.
  try {
    console.info("[academia-sync]", JSON.stringify({
      ts: new Date().toISOString(),
      userId,
      phase,
      ...details
    }));
  } catch (_error) {
    // ignore logging failures
  }
}

function classifyAcademiaSyncState(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("captcha")) return "captcha_required";
  if (text.includes("mfa") || text.includes("otp") || text.includes("manual action")) return "captcha_required";
  if (
    text.includes("invalid college credentials")
    || text.includes("invalid password")
    || text.includes("session limit")
    || text.includes("sign in")
    || text.includes("login")
    || text.includes("one-time login")
    || text.includes("session expired")
  ) {
    return "requires_relogin";
  }
  return "failed";
}

function tagAcademiaError(syncState, message) {
  return `[${syncState}] ${String(message || "Academia sync failed")}`;
}

function parseTaggedAcademiaError(lastError) {
  const text = String(lastError || "").trim();
  const m = text.match(/^\[(idle|syncing|success|requires_relogin|captcha_required|failed)\]\s*(.*)$/i);
  if (!m) {
    return { state: null, message: text || null };
  }
  return {
    state: String(m[1] || "").toLowerCase(),
    message: String(m[2] || "").trim() || null
  };
}

function shouldKeepAcademiaConnectedOnFailure(account) {
  return Boolean(account?.last_synced_at || account?.last_sync_checksum);
}

function resolveAcademiaStateRootDir() {
  const configured = String(process.env.ACADEMIA_STATE_DIR || "").trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(process.cwd(), "tmp");
}

function getAcademiaStatePaths(userId) {
  const stateRootDir = resolveAcademiaStateRootDir();
  return {
    encryptedPath: path.join(stateRootDir, `academia_storage_state_${userId}.enc`),
    legacyJsonPath: path.join(stateRootDir, `academia_storage_state_${userId}.json`)
  };
}

function persistEncryptedAcademiaStateFromJson(userId, jsonPath) {
  const inputPath = String(jsonPath || "").trim();
  if (!inputPath || !fs.existsSync(inputPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(inputPath, "utf8");
    const encrypted = encrypt(raw);
    const { encryptedPath } = getAcademiaStatePaths(userId);
    fs.mkdirSync(path.dirname(encryptedPath), { recursive: true });
    fs.writeFileSync(encryptedPath, encrypted, { mode: 0o600 });
    fs.unlinkSync(inputPath);
    return encryptedPath;
  } catch (_error) {
    return null;
  }
}

function readEncryptedAcademiaState(userId) {
  const { encryptedPath } = getAcademiaStatePaths(userId);
  if (!fs.existsSync(encryptedPath)) {
    return null;
  }
  const payload = String(fs.readFileSync(encryptedPath, "utf8") || "").trim();
  if (!payload) {
    return null;
  }
  try {
    const decrypted = decrypt(payload);
    if (!decrypted) {
      return null;
    }
    const parsed = JSON.parse(decrypted);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function resolveAcademiaSessionBootstrap(userId) {
  const { legacyJsonPath } = getAcademiaStatePaths(userId);
  const decryptedState = readEncryptedAcademiaState(userId);
  if (decryptedState) {
    return { storageState: decryptedState, storageStatePath: null, source: "encrypted_state" };
  }
  if (fs.existsSync(legacyJsonPath)) {
    return { storageState: null, storageStatePath: legacyJsonPath, source: "legacy_state_file" };
  }
  const envPath = String(process.env.ACADEMIA_STORAGE_STATE_PATH || "").trim() || null;
  if (envPath) {
    if (fs.existsSync(envPath)) {
      return { storageState: null, storageStatePath: envPath, source: "env_state_file" };
    }
    return { storageState: null, storageStatePath: null, source: "env_state_missing" };
  }
  return { storageState: null, storageStatePath: null, source: "none" };
}

const academiaSyncInFlight = new Map();

function canonicalHash(rows) {
  return createHash("sha256").update(JSON.stringify(rows || [])).digest("hex");
}

function hashTimetableRows(rows) {
  const list = (rows || []).map((r) => ({
    dayOrder: r.dayOrder ?? r.day_order ?? null,
    dayLabel: String(r.dayLabel ?? r.day_label ?? "").trim(),
    startTime: String(r.startTime ?? r.start_time ?? "").trim(),
    endTime: String(r.endTime ?? r.end_time ?? "").trim(),
    subjectName: String(r.subjectName ?? r.subject_name ?? "").trim(),
    facultyName: String(r.facultyName ?? r.faculty_name ?? "").trim(),
    roomLabel: String(r.roomLabel ?? r.room_label ?? "").trim()
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return canonicalHash(list);
}

function hashMarksRows(rows) {
  const list = (rows || []).map((r) => ({
    subjectName: String(r.subjectName ?? r.subject_name ?? "").trim(),
    componentName: String(r.componentName ?? r.component_name ?? "").trim(),
    score: Number(r.score ?? 0),
    maxScore: Number(r.maxScore ?? r.max_score ?? 0),
    percentage: Number(r.percentage ?? 0)
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return canonicalHash(list);
}

function hashAttendanceRows(rows) {
  const list = (rows || []).map((r) => ({
    subjectName: String(r.subjectName ?? r.subject_name ?? "").trim(),
    attendedClasses: Number(r.attendedClasses ?? r.attended_classes ?? 0),
    totalClasses: Number(r.totalClasses ?? r.total_classes ?? 0),
    attendancePercentage: Number(r.attendancePercentage ?? r.attendance_percentage ?? 0)
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return canonicalHash(list);
}

function getAcademiaSyncStateFromAccount(account) {
  if (!account) return "idle";
  const tagged = parseTaggedAcademiaError(account.last_error || null);
  if (account.status === "connected") {
    if (!account.last_synced_at) return "idle";
    return "success";
  }
  return tagged.state || "failed";
}

function ensureSession({ userId }) {
  academiaLog(userId, "session.ensure.start");
  let session = resolveAcademiaSessionBootstrap(userId);
  if (session.source === "legacy_state_file" && session.storageStatePath) {
    const encryptedPath = persistEncryptedAcademiaStateFromJson(userId, session.storageStatePath);
    const decryptedState = readEncryptedAcademiaState(userId);
    if (encryptedPath && decryptedState) {
      session = { storageState: decryptedState, storageStatePath: null, source: "encrypted_state" };
    }
  }
  academiaLog(userId, "session.ensure.done", { source: session.source });
  return session;
}

async function fetchAttendanceRaw({ userId, collegeEmail, collegePassword, session, scrapeMode = "full" }) {
  academiaLog(userId, "attendance.fetch.start");
  const scraped = await scrapeAcademiaData({
    collegeEmail,
    collegePassword,
    storageStatePath: session.storageStatePath,
    storageState: session.storageState,
    scrapeMode
  });
  academiaLog(userId, "attendance.fetch.done", {
    attendanceCount: (scraped?.attendance || []).length,
    attendanceDailyCount: (scraped?.attendanceDaily || []).length
  });
  return scraped;
}

function parseAttendance(scraped) {
  return {
    aggregate: Array.isArray(scraped?.attendance) ? scraped.attendance : [],
    daily: Array.isArray(scraped?.attendanceDaily) ? scraped.attendanceDaily : []
  };
}

function normalizeMarksRows(rows, timetableRows = [], attendanceRows = []) {
  const noiseSubject = /registration|semester|enrollment|status|doe|branch|program|mobile|email|address|father|mother/i;
  const componentHint = /ft|quiz|internal|assignment|assign|lab|practical|mid|end|cat|ut|cie|overall/i;
  const dedupedByStableKey = new Map();
  const codeToTitle = new Map();
  for (const row of timetableRows || []) {
    const code = String(row?.courseCode || "").toUpperCase().replace(/\bREGULAR\b/g, "").trim();
    const title = String(row?.subjectName || "").trim();
    if (code && title && !codeToTitle.has(code)) {
      codeToTitle.set(code, title);
    }
  }
  for (const row of attendanceRows || []) {
    const code = String(row?.courseCode || row?.course_code || "").toUpperCase().replace(/\bREGULAR\b/g, "").trim();
    const title = String(row?.subjectName || row?.subject_name || "").trim();
    if (code && title && !codeToTitle.has(code)) {
      codeToTitle.set(code, title);
    }
  }

  for (const row of rows || []) {
    let subjectName = String(row?.subjectName || "").trim().replace(/\bRegular\b/gi, "").replace(/\s+/g, " ").trim().slice(0, 255);
    const codeWithType = subjectName.match(/^([0-9]{2}[A-Z]{2,}\d+[A-Z]?)\s+(theory|practical|lab)\b/i);
    if (codeWithType) {
      subjectName = String(codeWithType[1] || "").trim();
    }
    const normalizedCode = subjectName.toUpperCase().replace(/\bREGULAR\b/g, "").trim();
    if (/^[0-9]{2}[A-Z]{2,}\d+[A-Z]?$/.test(normalizedCode) && codeToTitle.has(normalizedCode)) {
      subjectName = String(codeToTitle.get(normalizedCode) || subjectName).slice(0, 255);
    }
    let componentName = String(row?.componentName || "overall").trim().slice(0, 255);
    let score = Number(row?.score);
    let maxScore = Number(row?.maxScore);

    // Recover rows like "FT-I/5.00 2.50" that may leak into componentName.
    const inline = componentName.match(/^([A-Za-z0-9-]+)\s*\/\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (inline) {
      componentName = inline[1];
      maxScore = Number(inline[2]);
      score = Number(inline[3]);
    }

    if (!subjectName || noiseSubject.test(subjectName)) continue;
    if (!/[a-z]/i.test(subjectName)) continue;
    if (!componentHint.test(componentName)) continue;
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 200) continue;
    if (score < 0 || score > maxScore) continue;

    const percentage = Number(((score / maxScore) * 100).toFixed(2));
    const subjectCodeForKey = /^[0-9]{2}[A-Z]{2,}\d+[A-Z]?$/.test(normalizedCode) ? normalizedCode : "";
    const examTypeForKey = String(row?.examType || componentName || "overall").toLowerCase().trim() || "overall";
    const termForKey = String(row?.term || row?.semester || row?.examTerm || "current").toLowerCase().trim() || "current";
    const stableKey = `${termForKey}|${examTypeForKey}|${subjectCodeForKey || subjectName.toLowerCase()}`;
    const normalizedRow = {
      id: row?.id || createId("amk"),
      subjectName,
      componentName,
      score,
      maxScore,
      percentage
    };
    const existing = dedupedByStableKey.get(stableKey);
    if (!existing) {
      dedupedByStableKey.set(stableKey, normalizedRow);
      continue;
    }
    const existingIsCode = /^[0-9]{2}[A-Z]{2,}\d+[A-Z]?$/.test(String(existing.subjectName || "").toUpperCase());
    const currentIsCode = /^[0-9]{2}[A-Z]{2,}\d+[A-Z]?$/.test(String(subjectName || "").toUpperCase());
    const shouldReplace =
      (existingIsCode && !currentIsCode)
      || (maxScore > Number(existing.maxScore || 0))
      || (maxScore === Number(existing.maxScore || 0) && score > Number(existing.score || 0));
    if (shouldReplace) {
      dedupedByStableKey.set(stableKey, normalizedRow);
    }
  }

  return [...dedupedByStableKey.values()];
}

function normalizeAttendance(parsed) {
  const aggregateRaw = (parsed?.aggregate || []).map((row) => {
    const totalClasses = Math.max(0, Math.round(Number(row.totalClasses || 0)));
    const attendedClasses = Math.min(totalClasses, Math.max(0, Math.round(Number(row.attendedClasses || 0))));
    const computed = totalClasses > 0 ? Number(((attendedClasses / totalClasses) * 100).toFixed(2)) : 0;
    const attendancePercentage = Number(row.attendancePercentage || computed);
    return {
      id: row.id || createId("aat"),
      subjectName: String(row.subjectName || "").trim().slice(0, 255),
      courseCode: String(row.courseCode || row.course_code || "").trim().toUpperCase() || null,
      attendedClasses,
      totalClasses,
      attendancePercentage: Number.isFinite(attendancePercentage) ? attendancePercentage : computed
    };
  }).filter((row) => row.subjectName && row.totalClasses > 0);

  const aggregate = [];
  for (const row of aggregateRaw) {
    const idx = aggregate.findIndex((current) => {
      if (current.attendedClasses !== row.attendedClasses || current.totalClasses !== row.totalClasses) return false;
      const c = current.subjectName.toLowerCase();
      const r = row.subjectName.toLowerCase();
      return c === r || c.includes(r) || r.includes(c);
    });

    if (idx < 0) {
      aggregate.push(row);
      continue;
    }
    const curr = aggregate[idx];
    if (row.subjectName.length < curr.subjectName.length) {
      aggregate[idx] = row;
      continue;
    }
    if (!curr.courseCode && row.courseCode) {
      aggregate[idx] = { ...curr, courseCode: row.courseCode };
    }
  }
  return {
    aggregate,
    daily: parsed?.daily || [],
    version: hashAttendanceRows(aggregate)
  };
}

async function connectAcademiaCredentials(userId, { collegeEmail, collegePassword }) {
  const email = String(collegeEmail || "").trim().toLowerCase();
  const password = String(collegePassword || "");

  if (!email || !password) {
    throw new Error("collegeEmail and collegePassword are required");
  }

  await integrationModel.saveAcademiaCredentials(userId, {
    collegeEmail: email,
    encryptedPassword: encrypt(password)
  });

  return { connected: true, collegeEmail: email };
}

async function captureAcademiaSession(userId) {
  const account = await integrationModel.getAcademiaAccount(userId);
  if (!account || !account.password_encrypted) {
    throw new Error("Academia account not connected");
  }

  const { legacyJsonPath: outPath } = getAcademiaStatePaths(userId);
  academiaLog(userId, "session_capture_start");
  await captureAcademiaStorageState({
    collegeEmail: account.college_email,
    collegePassword: decrypt(account.password_encrypted),
    outputPath: outPath
  });
  const encryptedPath = persistEncryptedAcademiaStateFromJson(userId, outPath);
  academiaLog(userId, "session_capture_done", { encrypted: Boolean(encryptedPath) });
  return {
    captured: true,
    storageStatePath: encryptedPath || outPath,
    secureStorage: Boolean(encryptedPath)
  };
}

async function scrapeAcademiaForSync({ userId, account, syncLabel = "sync" }) {
  const lockKey = `${userId}:${syncLabel}`;
  const activeTask = academiaSyncInFlight.get(lockKey);
  if (activeTask) {
    return activeTask;
  }
  const scrapeMode = syncLabel === "sync_reports"
    ? "reports"
    : syncLabel === "sync_marks_attendance"
      ? "marks_attendance"
      : "full";

  const task = (async () => {
    const sessionBootstrap = ensureSession({ userId });
    try {
      return await fetchAttendanceRaw({
        userId,
        collegeEmail: account.college_email,
        collegePassword: decrypt(account.password_encrypted),
        session: sessionBootstrap,
        scrapeMode
      });
    } catch (error) {
      const message = String(error.message || "Academia sync failed");
      const syncState = classifyAcademiaSyncState(message);
      academiaLog(userId, `${syncLabel}_failed`, { syncState, reason: message.slice(0, 220) });
      await integrationModel.updateAcademiaSyncState(userId, {
        status: shouldKeepAcademiaConnectedOnFailure(account) ? "connected" : "failed",
        lastError: tagAcademiaError(syncState, message)
      });
      const wrapped = new Error(message);
      wrapped.syncState = syncState;
      throw wrapped;
    } finally {
      academiaSyncInFlight.delete(lockKey);
    }
  })();

  academiaSyncInFlight.set(lockKey, task);
  return task;
}

async function syncAcademiaData(userId) {
  const totalStartMs = Date.now();
  const account = await integrationModel.getAcademiaAccount(userId);
  if (!account || !account.password_encrypted) {
    throw new Error("Academia account not connected");
  }

  academiaLog(userId, "sync_marks_attendance_start");
  const scraped = await scrapeAcademiaForSync({ userId, account, syncLabel: "sync_marks_attendance" });

  const normalizeParseStartMs = Date.now();
  const parsedAttendance = parseAttendance(scraped);
  const normalizedAttendance = normalizeAttendance(parsedAttendance);
  const scrapedMarks = normalizeMarksRows(
    scraped.marks || [],
    scraped.timetable || [],
    normalizedAttendance.aggregate || []
  );
  const normalizeParseMs = Date.now() - normalizeParseStartMs;
  const sourceChecksum = canonicalHash({
    marksHash: hashMarksRows(scrapedMarks),
    attendanceHash: normalizedAttendance.version,
    sourceUrl: String(scraped?.sourceUrl || "")
  });
  if (normalizedAttendance.aggregate.length === 0) {
    const message = "Academia attendance sync found no aggregate rows. Run One-time Login and retry.";
    const syncState = "requires_relogin";
    academiaLog(userId, "sync_marks_attendance_failed", { syncState, reason: message });
    await integrationModel.updateAcademiaSyncState(userId, {
      status: shouldKeepAcademiaConnectedOnFailure(account) ? "connected" : "failed",
      lastError: tagAcademiaError(syncState, message)
    });
    const wrapped = new Error(message);
    wrapped.syncState = syncState;
    throw wrapped;
  }

  academiaLog(userId, "sync_marks_attendance_parse_complete", {
    marksCount: scrapedMarks.length,
    attendanceCount: normalizedAttendance.aggregate.length,
    attendanceDailyCount: normalizedAttendance.daily.length
  });

  const [existingMarks, existingAttendance] = await Promise.all([
    integrationModel.listAcademiaMarksRows(userId),
    integrationModel.listAcademiaAttendanceRows(userId)
  ]);

  const marksChanged = scrapedMarks.length > 0 && hashMarksRows(existingMarks) !== hashMarksRows(scrapedMarks);
  const attendanceChanged = hashAttendanceRows(existingAttendance || []) !== normalizedAttendance.version;

  academiaLog(userId, "sync_marks_attendance_diff", {
    marksChanged,
    attendanceChanged
  });

  const dbUpsertStartMs = Date.now();
  if (marksChanged || attendanceChanged) {
    await integrationModel.replaceUserAcademicRecordsFromAcademia(userId, {
      marksRows: marksChanged ? scrapedMarks : [],
      attendanceRows: attendanceChanged ? normalizedAttendance.aggregate : []
    });
  }
  const dbUpsertMs = Date.now() - dbUpsertStartMs;
  await integrationModel.updateAcademiaSyncState(userId, {
    status: "connected",
    lastError: null,
    checksum: sourceChecksum,
    fetchedAt: new Date()
  });
  const scrapeTimings = scraped?.timings || {};
  const timings = {
    loginMs: Number(scrapeTimings.loginMs || 0),
    pageFetchMs: Number(scrapeTimings.pageFetchMs || 0),
    parseMs: Number(scrapeTimings.parseMs || 0) + normalizeParseMs,
    dbUpsertMs,
    totalMs: Date.now() - totalStartMs
  };
  academiaLog(userId, "sync_marks_attendance_timing", timings);
  academiaLog(userId, "sync_marks_attendance_success", {
    marksWritten: marksChanged,
    attendanceWritten: attendanceChanged
  });

  return {
    synced: true,
    syncState: "success",
    timetableCount: 0,
    marksCount: scrapedMarks.length,
    attendanceCount: normalizedAttendance.aggregate.length,
    attendanceDailyCount: normalizedAttendance.daily.length,
    writes: {
      timetable: false,
      marks: marksChanged,
      attendance: attendanceChanged
    },
    sourceChecksum,
    timings
  };
}

async function syncAcademiaReportsData(userId) {
  const account = await integrationModel.getAcademiaAccount(userId);
  if (!account || !account.password_encrypted) {
    throw new Error("Academia account not connected");
  }

  academiaLog(userId, "sync_reports_start");
  const scraped = await scrapeAcademiaForSync({ userId, account, syncLabel: "sync_reports" });
  const scrapedTimetable = scraped.timetable || [];
  const scrapedAcademicCalendar = scraped.academicCalendar || [];
  if (scrapedTimetable.length === 0) {
    const message = "Academia reports sync found no timetable rows. Run One-time Login and retry.";
    const syncState = "requires_relogin";
    academiaLog(userId, "sync_reports_failed", { syncState, reason: message });
    await integrationModel.updateAcademiaSyncState(userId, {
      status: shouldKeepAcademiaConnectedOnFailure(account) ? "connected" : "failed",
      lastError: tagAcademiaError(syncState, message)
    });
    const wrapped = new Error(message);
    wrapped.syncState = syncState;
    throw wrapped;
  }

  const existingTimetable = await integrationModel.listAcademiaTimetableRows(userId);
  const timetableChanged = hashTimetableRows(existingTimetable) !== hashTimetableRows(scrapedTimetable);

  const sharedWrite = await integrationModel.replaceSectionUnifiedTimetableFromAcademia(userId, scrapedTimetable, {
    batchNumber: scraped?.batchNumber,
    batchLabel: scraped?.batchLabel,
    sourceUrl: scraped?.sourceUrl
  });
  const calendarWrite = await integrationModel.replaceAcademicCalendarFromAcademia(userId, scrapedAcademicCalendar);

  await integrationModel.updateAcademiaSyncState(userId, {
    status: "connected",
    lastError: null
  });

  academiaLog(userId, "sync_reports_success", {
    sharedTimetableWritten: sharedWrite.written,
    insertedEntries: sharedWrite.insertedEntries,
    calendarWritten: calendarWrite.written,
    calendarRows: calendarWrite.insertedRows || 0
  });

  return {
    synced: true,
    syncState: "success",
    mode: "reports",
    timetableCount: scrapedTimetable.length,
    academicCalendarCount: scrapedAcademicCalendar.length,
    writes: {
      timetableChanged,
      sharedTimetable: Boolean(sharedWrite.written),
      academicCalendar: Boolean(calendarWrite.written)
    },
    shared: sharedWrite,
    calendar: calendarWrite
  };
}

async function getAcademiaStatus(userId) {
  const account = await integrationModel.getAcademiaAccount(userId);
  if (!account) {
    return {
      connected: false,
      collegeEmail: null,
      lastSyncedAt: null,
      lastError: null,
      syncState: "idle"
    };
  }

  const tagged = parseTaggedAcademiaError(account.last_error || null);
  const syncState = getAcademiaSyncStateFromAccount(account);

  return {
    connected: account.status === "connected",
    collegeEmail: account.college_email,
    lastSyncedAt: account.last_synced_at || null,
    lastError: tagged.message || null,
    syncState
  };
}

async function getAcademiaData(userId) {
  const [timetable, marks, attendance] = await Promise.all([
    integrationModel.listAcademiaTimetableRows(userId),
    integrationModel.listAcademiaMarksRows(userId),
    integrationModel.listAcademiaAttendanceRows(userId)
  ]);

  return {
    timetable,
    marks,
    attendance
  };
}

async function listAcademicSources(userId) {
  return integrationModel.listAcademicEnrollments(userId);
}

async function registerAcademicSource(userId, payload) {
  const providerCode = String(payload?.providerCode || "").trim().toLowerCase();
  const sourceType = String(payload?.sourceType || "course").trim().toLowerCase();
  const sourceName = String(payload?.sourceName || "").trim();
  const sourceKey = String(payload?.sourceKey || sourceName).trim();
  const senderEmail = payload?.senderEmail ? String(payload.senderEmail).trim().toLowerCase() : null;
  const endsOn = payload?.endsOn ? new Date(payload.endsOn) : null;

  if (!providerCode || !sourceName) {
    throw new Error("providerCode and sourceName are required");
  }
  if (!["college", "classroom", "nptel", "coursera", "udemy", "hackathon", "other"].includes(providerCode)) {
    throw new Error("providerCode must be one of college, classroom, nptel, coursera, udemy, hackathon, other");
  }
  if (!["course", "classroom", "hackathon", "other"].includes(sourceType)) {
    throw new Error("sourceType must be one of course, classroom, hackathon, other");
  }
  if (endsOn && Number.isNaN(endsOn.getTime())) {
    throw new Error("endsOn must be a valid date");
  }

  const row = await integrationModel.registerAcademicEnrollment(userId, {
    providerCode,
    sourceType,
    sourceName,
    sourceKey,
    senderEmail,
    endsOn
  });
  if (!row) {
    throw new Error("Unable to register academic source");
  }
  return row;
}

async function removeAcademicSource(userId, enrollmentId) {
  const id = String(enrollmentId || "").trim();
  if (!id) {
    throw new Error("enrollmentId is required");
  }
  const removed = await integrationModel.deleteAcademicEnrollment(userId, id);
  if (!removed) {
    throw new Error("Academic source not found");
  }
  return { removed: true, enrollmentId: id };
}

async function refreshGoogleTokensJob() {
  const accounts = await integrationModel.listGoogleAccountsWithRefreshToken();
  let refreshed = 0;
  let revoked = 0;

  for (const account of accounts) {
    try {
      const refreshToken = account.google_refresh_token ? decrypt(account.google_refresh_token) : null;
      if (!refreshToken) {
        continue;
      }

      const authClient = buildAuthedClient({
        accessToken: account.google_access_token ? decrypt(account.google_access_token) : null,
        refreshToken,
        tokenExpiry: account.google_token_expiry || null
      });

      const response = await authClient.getAccessToken();
      const accessToken = response?.token;

      if (!accessToken) {
        continue;
      }

      await integrationModel.saveGoogleTokens(account.user_id, {
        googleId: account.google_id,
        googleEmail: account.google_email || null,
        googleName: account.google_name || null,
        accessToken: encrypt(accessToken),
        refreshToken: null,
        tokenExpiry: null,
        setPrimary: Number(account.is_primary || 0) === 1
      });

      refreshed += 1;
    } catch (error) {
      if (isRefreshTokenRevocationError(error)) {
        const removed = account.account_id
          ? await integrationModel.removeGoogleAccount(account.user_id, account.account_id)
          : false;
        if (!removed) {
          await integrationModel.clearGoogleTokens(account.user_id);
        }
        revoked += 1;
      }
      continue;
    }
  }

  return { accounts: accounts.length, refreshed, revoked };
}

module.exports = {
  startGoogleOAuth,
  completeGoogleOAuth,
  completeGoogleOAuthFromState,
  createCalendarEvent,
  pushWorkoutToGoogleFit,
  parseGmailForAcademicEvents,
  syncGoogleFitDailyMetrics,
  syncGoogleFitBodyMetrics,
  getFitDailyMetrics,
  listFitMetricsRange,
  listGoogleFitActivities,
  syncPendingCalendarEvents,
  syncGoogleCalendarEvents,
  refreshGoogleTokensJob,
  getCalendarEvents,
  getIntegrationStatus,
  listGoogleAccounts,
  setPrimaryGoogleAccount,
  setFitGoogleAccount,
  disconnectGoogleAccount,
  connectAcademiaCredentials,
  captureAcademiaSession,
  syncAcademiaData,
  syncAcademiaReportsData,
  getAcademiaStatus,
  getAcademiaData,
  listAcademicSources,
  registerAcademicSource,
  removeAcademicSource,
  __test: {
    normalizeMarksRows
  }
};

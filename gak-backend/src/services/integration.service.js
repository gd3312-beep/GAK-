const { randomUUID } = require("crypto");

const integrationModel = require("../models/integration.model");
const fitModel = require("../models/fit.model");
const { ensureGoogleOauthConfig, getGoogleAuthUrl, getTokensFromCode, buildAuthedClient, google } = require("../config/google");
const { decrypt, encrypt } = require("../utils/encryption.util");
const { createOAuthStateToken, verifyOAuthStateToken } = require("../utils/oauth-state.util");
const { isRelevantAcademicEmail, extractDeadline } = require("../utils/email.util");
const { scrapeAcademiaData } = require("../utils/academia.scraper.util");

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

  return {
    accountId: account.account_id,
    userId: account.user_id,
    googleId: account.google_id || null,
    email: account.google_email || null,
    name: account.google_name || null,
    tokenExpiry: account.google_token_expiry || null,
    isPrimary: Number(account.is_primary || 0) === 1,
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

async function requireFitAccountSelection(userId) {
  const selection = await getFitAccountSelection(userId);
  if (!selection.accountId) {
    return { ok: false, reason: "Google Fit account not selected" };
  }
  if (!selection.account) {
    return { ok: false, reason: "Selected Google Fit account is not connected" };
  }
  return { ok: true, accountId: selection.accountId, account: selection.account };
}

async function startGoogleOAuth(userId) {
  requireGoogleConfigured();

  // Opportunistic cleanup to keep nonce table bounded.
  await integrationModel.purgeOAuthStateNonces().catch(() => undefined);

  const nonce = randomUUID();
  const ttlMs = getOAuthStateTtlMs();
  const expiresAt = new Date(Date.now() + ttlMs);
  await integrationModel.saveOAuthStateNonce({ nonce, userId, expiresAt });

  const state = createOAuthStateToken({ userId, nonce, ttlMs });
  return getGoogleAuthUrl(state);
}

async function completeGoogleOAuth(code, explicitUserId = null) {
  requireGoogleConfigured();

  const tokens = await getTokensFromCode(code);
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
      refreshToken
    });
  } catch (_error) {
    return null;
  }
}

async function createCalendarEvent(userId, { title, eventType, eventDate, googleAccountId = null }) {
  const eventId = randomUUID();
  const pushResult = await pushCalendarEventToGoogle(userId, { title, eventDate, googleAccountId });

  await integrationModel.createCalendarEventRecord({
    eventId,
    userId,
    eventDate,
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
    const authClient = await buildUserGoogleClient(userId, googleAccountId);

    if (authClient) {
      const calendar = google.calendar({ version: "v3", auth: authClient });
      const start = new Date(eventDate);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const result = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: title,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() }
        }
      });

      googleEventId = result.data.id || null;
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

    const authClient = await buildUserGoogleClient(userId, selection.accountId);

    if (authClient) {
      const fitness = google.fitness({ version: "v1", auth: authClient });
      const startTime = new Date(`${String(session.workout_date).slice(0, 10)}T06:00:00Z`);
      const endTime = new Date(startTime.getTime() + Number(session.duration_minutes || 30) * 60 * 1000);

      googleFitSessionId = `${session.session_id}`;

      await fitness.users.sessions.update({
        userId: "me",
        sessionId: googleFitSessionId,
        requestBody: {
          id: googleFitSessionId,
          name: `GAK ${session.workout_type}`,
          description: `${session.muscle_group}`,
          startTimeMillis: String(startTime.getTime()),
          endTimeMillis: String(endTime.getTime()),
          application: { name: "GAK", version: "1.0" },
          activityType: 8
        }
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

async function parseGmailForAcademicEvents(userId, { accountId = null } = {}) {
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
    const summary = {
      accountId: account.account_id,
      email: account.google_email || null,
      processed: 0,
      createdEvents: 0,
      status: "ok",
      error: null
    };

    try {
      const authClient = await buildUserGoogleClient(userId, account.account_id);
      if (!authClient) {
        summary.status = "skipped";
        summary.error = "Missing or unreadable token";
        accountResults.push(summary);
        continue;
      }

      const gmail = google.gmail({ version: "v1", auth: authClient });
      const list = await gmail.users.messages.list({ userId: "me", q: "is:unread", maxResults: 20 });
      const messageIds = (list.data.messages || []).map((item) => item.id).filter(Boolean);

      for (const id of messageIds) {
        const details = await gmail.users.messages.get({ userId: "me", id });
        const headers = details.data.payload?.headers || [];
        const subject = headers.find((h) => String(h.name).toLowerCase() === "subject")?.value || "";
        const snippet = details.data.snippet || "";

        if (!isRelevantAcademicEmail(`${subject} ${snippet}`)) {
          continue;
        }

        summary.processed += 1;
        processed += 1;

        const parsedDeadline = extractDeadline(`${subject} ${snippet}`);

        await integrationModel.createEmailEvent({
          id: randomUUID(),
          userId,
          subject,
          parsedDeadline,
          confidenceScore: parsedDeadline ? 0.9 : 0.4,
          sourceMessageId: id,
          sourceAccountEmail: account.google_email || account.google_id || account.account_id
        });

        if (parsedDeadline) {
          await createCalendarEvent(userId, {
            title: subject,
            eventType: "academic",
            eventDate: parsedDeadline,
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

    accountResults.push(summary);
  }

  return {
    processed,
    createdEvents,
    accounts: accountResults,
    accountCount: accountResults.length
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

async function syncGoogleFitDailyMetrics(userId, date) {
  const selection = await requireFitAccountSelection(userId);
  if (!selection.ok) {
    return { connected: false, date, steps: null, calories: null, heartRateAvg: null, reason: selection.reason };
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

  const resp = await fitness.users.dataset.aggregate({
    userId: "me",
    requestBody: {
      aggregateBy: [
        { dataTypeName: "com.google.step_count.delta" },
        { dataTypeName: "com.google.calories.expended" },
        { dataTypeName: "com.google.heart_rate.bpm" }
      ],
      bucketByTime: { durationMillis: 24 * 60 * 60 * 1000 },
      startTimeMillis: String(startMillis),
      endTimeMillis: String(endMillis)
    }
  });

  const bucket = resp.data.bucket?.[0];
  const datasets = bucket?.dataset || [];

  const steps = datasets[0] ? sumDatasetInt(datasets[0]) : null;
  const calories = datasets[1] ? Number(sumDatasetFloat(datasets[1]).toFixed(2)) : null;
  const heartRateAvg = datasets[2] ? avgDatasetFloat(datasets[2]) : null;

  await fitModel.upsertDailyFitMetrics({
    userId,
    metricDate: String(date).slice(0, 10),
    steps,
    calories,
    heartRateAvg: heartRateAvg === null ? null : Number(heartRateAvg.toFixed(2))
  });

  return { connected: true, date: String(date).slice(0, 10), steps, calories, heartRateAvg };
}

async function getFitDailyMetrics(userId, date) {
  const metricDate = String(date).slice(0, 10);
  const selection = await requireFitAccountSelection(userId);
  if (!selection.ok) {
    return { connected: false, date: metricDate, steps: null, calories: null, heartRateAvg: null, reason: selection.reason };
  }

  const cached = await fitModel.getDailyFitMetrics(userId, metricDate);
  if (cached) {
    return {
      connected: true,
      date: metricDate,
      steps: cached.steps === null ? null : Number(cached.steps),
      calories: cached.calories === null ? null : Number(cached.calories),
      heartRateAvg: cached.heart_rate_avg === null ? null : Number(cached.heart_rate_avg)
    };
  }

  // No cached record yet: fetch and persist.
  return syncGoogleFitDailyMetrics(userId, metricDate);
}

async function listFitMetricsRange(userId, fromDate) {
  const from = String(fromDate).slice(0, 10);
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
    academiaLastError: academia?.last_error || null
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

  const saved = await integrationModel.setFitGoogleAccountSelectionOnce(userId, cleanAccountId);
  if (!saved) {
    throw new Error("Google Fit account is already selected and locked");
  }

  return listGoogleAccounts(userId);
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

async function syncAcademiaData(userId) {
  const account = await integrationModel.getAcademiaAccount(userId);
  if (!account || !account.password_encrypted) {
    throw new Error("Academia account not connected");
  }

  let scraped;
  try {
    scraped = await scrapeAcademiaData({
      collegeEmail: account.college_email,
      collegePassword: decrypt(account.password_encrypted)
    });
  } catch (error) {
    const message = String(error.message || "Academia sync failed");
    await integrationModel.updateAcademiaSyncState(userId, {
      status: "failed",
      lastError: message
    });
    throw new Error(message);
  }

  await integrationModel.clearAcademiaCaches(userId);
  await Promise.all([
    integrationModel.insertAcademiaTimetableRows(userId, scraped.timetable || []),
    integrationModel.insertAcademiaMarksRows(userId, scraped.marks || []),
    integrationModel.insertAcademiaAttendanceRows(userId, scraped.attendance || [])
  ]);

  await integrationModel.updateAcademiaSyncState(userId, {
    status: "connected",
    lastError: null
  });

  return {
    synced: true,
    timetableCount: (scraped.timetable || []).length,
    marksCount: (scraped.marks || []).length,
    attendanceCount: (scraped.attendance || []).length
  };
}

async function getAcademiaStatus(userId) {
  const account = await integrationModel.getAcademiaAccount(userId);
  if (!account) {
    return {
      connected: false,
      collegeEmail: null,
      lastSyncedAt: null,
      lastError: null
    };
  }

  return {
    connected: account.status === "connected",
    collegeEmail: account.college_email,
    lastSyncedAt: account.last_synced_at || null,
    lastError: account.last_error || null
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
        refreshToken
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
  getFitDailyMetrics,
  listFitMetricsRange,
  syncPendingCalendarEvents,
  refreshGoogleTokensJob,
  getCalendarEvents,
  getIntegrationStatus,
  listGoogleAccounts,
  setPrimaryGoogleAccount,
  setFitGoogleAccount,
  disconnectGoogleAccount,
  connectAcademiaCredentials,
  syncAcademiaData,
  getAcademiaStatus,
  getAcademiaData
};

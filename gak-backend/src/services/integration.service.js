const { randomUUID } = require("crypto");

const integrationModel = require("../models/integration.model");
const fitModel = require("../models/fit.model");
const { getGoogleAuthUrl, getTokensFromCode, buildAuthedClient, google } = require("../config/google");
const { decrypt, encrypt } = require("../utils/encryption.util");
const { isRelevantAcademicEmail, extractDeadline } = require("../utils/email.util");
const { scrapeAcademiaData } = require("../utils/academia.scraper.util");

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

async function startGoogleOAuth(userId) {
  if (!isGoogleConfigured()) {
    throw new Error("Google OAuth config missing in environment");
  }

  const state = Buffer.from(JSON.stringify({ userId, t: Date.now() })).toString("base64url");
  return getGoogleAuthUrl(state);
}

async function completeGoogleOAuth(code, explicitUserId = null) {
  if (!isGoogleConfigured()) {
    throw new Error("Google OAuth config missing in environment");
  }

  const tokens = await getTokensFromCode(code);
  const authClient = buildAuthedClient({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });

  const oauth2 = google.oauth2({ version: "v2", auth: authClient });
  const profile = await oauth2.userinfo.get();
  const googleId = profile.data.id || null;

  const userId = explicitUserId;
  if (!userId) {
    throw new Error("userId is required to persist Google tokens");
  }

  await integrationModel.saveGoogleTokens(userId, {
    googleId,
    accessToken: encrypt(tokens.access_token || ""),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null
  });

  return { userId, googleId };
}

function parseStateUserId(state) {
  if (!state) {
    return null;
  }

  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed.userId || null;
  } catch (_error) {
    return null;
  }
}

async function completeGoogleOAuthFromState(code, state) {
  const userId = parseStateUserId(state);
  if (!userId) {
    throw new Error("Invalid OAuth state");
  }

  return completeGoogleOAuth(code, userId);
}

async function buildUserGoogleClient(userId) {
  const tokens = await integrationModel.getUserGoogleTokens(userId);
  if (!tokens || !tokens.google_access_token) {
    return null;
  }

  return buildAuthedClient({
    accessToken: decrypt(tokens.google_access_token),
    refreshToken: decrypt(tokens.google_refresh_token)
  });
}

async function createCalendarEvent(userId, { title, eventType, eventDate }) {
  const eventId = randomUUID();
  const pushResult = await pushCalendarEventToGoogle(userId, { title, eventDate });

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

async function pushCalendarEventToGoogle(userId, { title, eventDate }) {
  let googleEventId = null;
  let syncStatus = "pending";

  try {
    const authClient = await buildUserGoogleClient(userId);

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
  const session = await integrationModel.getWorkoutSessionById(sessionId);

  if (!session) {
    throw new Error("Invalid session_id: workout session not found");
  }

  let syncStatus = "pending";
  let googleFitSessionId = null;

  try {
    const authClient = await buildUserGoogleClient(userId);

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
    }
  } catch (_error) {
    syncStatus = "failed";
  }

  await integrationModel.updateWorkoutGoogleSync(sessionId, { googleFitSessionId, syncStatus });

  return { sessionId, googleFitSessionId, syncStatus };
}

async function parseGmailForAcademicEvents(userId) {
  const authClient = await buildUserGoogleClient(userId);
  if (!authClient) {
    return { processed: 0, createdEvents: 0, reason: "Google account not connected" };
  }

  const gmail = google.gmail({ version: "v1", auth: authClient });
  const list = await gmail.users.messages.list({ userId: "me", q: "is:unread", maxResults: 20 });
  const messageIds = (list.data.messages || []).map((item) => item.id).filter(Boolean);

  let processed = 0;
  let createdEvents = 0;

  for (const id of messageIds) {
    const details = await gmail.users.messages.get({ userId: "me", id });
    const headers = details.data.payload?.headers || [];
    const subject = headers.find((h) => String(h.name).toLowerCase() === "subject")?.value || "";
    const snippet = details.data.snippet || "";

    if (!isRelevantAcademicEmail(`${subject} ${snippet}`)) {
      continue;
    }

    processed += 1;

    const parsedDeadline = extractDeadline(`${subject} ${snippet}`);

    await integrationModel.createEmailEvent({
      id: randomUUID(),
      userId,
      subject,
      parsedDeadline,
      confidenceScore: parsedDeadline ? 0.9 : 0.4
    });

    if (parsedDeadline) {
      await createCalendarEvent(userId, {
        title: subject,
        eventType: "academic",
        eventDate: parsedDeadline
      });
      createdEvents += 1;
    }
  }

  return { processed, createdEvents };
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
  const authClient = await buildUserGoogleClient(userId);
  if (!authClient) {
    return { connected: false, date, steps: null, calories: null, heartRateAvg: null };
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
  const [tokens, academia] = await Promise.all([
    integrationModel.getUserGoogleTokens(userId),
    integrationModel.getAcademiaAccount(userId)
  ]);

  return {
    googleConnected: Boolean(tokens && tokens.google_id),
    tokenExpiry: tokens?.google_token_expiry || null,
    academiaConnected: Boolean(academia && academia.status === "connected"),
    academiaEmail: academia?.college_email || null,
    academiaLastSyncedAt: academia?.last_synced_at || null,
    academiaLastError: academia?.last_error || null
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
    await integrationModel.updateAcademiaSyncState(userId, {
      status: "failed",
      lastError: String(error.message || "Academia sync failed")
    });
    throw error;
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
  const users = await integrationModel.listUsersWithRefreshToken();
  let refreshed = 0;

  for (const user of users) {
    try {
      const authClient = buildAuthedClient({
        accessToken: decrypt(user.google_access_token),
        refreshToken: decrypt(user.google_refresh_token)
      });

      const response = await authClient.getAccessToken();
      const accessToken = response?.token;

      if (!accessToken) {
        continue;
      }

      await integrationModel.saveGoogleTokens(user.user_id, {
        googleId: null,
        accessToken: encrypt(accessToken),
        refreshToken: null,
        tokenExpiry: null
      });

      refreshed += 1;
    } catch (_error) {
      continue;
    }
  }

  return { users: users.length, refreshed };
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
  connectAcademiaCredentials,
  syncAcademiaData,
  getAcademiaStatus,
  getAcademiaData
};

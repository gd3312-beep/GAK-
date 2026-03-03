const { google } = require("googleapis");

const BASE_SCOPES = ["openid", "email", "profile"];
const PURPOSE_SCOPES = {
  calendar_gmail: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly"
  ],
  tasks: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/tasks"
  ],
  docs: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/documents"
  ],
  fit: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.activity.write",
    "https://www.googleapis.com/auth/fitness.body.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read"
  ],
  all: [
    ...BASE_SCOPES,
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.activity.write",
    "https://www.googleapis.com/auth/fitness.body.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read"
  ]
};

function isLocalHost(url) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function ensureGoogleOauthConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth config missing in environment");
  }

  let parsed;
  try {
    parsed = new URL(redirectUri);
  } catch (_error) {
    throw new Error("GOOGLE_REDIRECT_URI must be a valid URL");
  }

  const runtime = String(process.env.NODE_ENV || "").toLowerCase();
  if (runtime === "production" && parsed.protocol !== "https:" && !isLocalHost(parsed)) {
    throw new Error("GOOGLE_REDIRECT_URI must use https in production");
  }

  const allowlist = String(process.env.GOOGLE_ALLOWED_REDIRECT_URIS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(redirectUri)) {
    throw new Error("GOOGLE_REDIRECT_URI is not in GOOGLE_ALLOWED_REDIRECT_URIS");
  }
}

function getOAuthClient() {
  ensureGoogleOauthConfig();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getScopes() {
  const configured = String(process.env.GOOGLE_OAUTH_SCOPES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length > 0) {
    return configured;
  }

  return PURPOSE_SCOPES.all;
}

function normalizePurpose(purpose) {
  const raw = String(purpose || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "calendar" || raw === "gmail") return "calendar_gmail";
  if (raw === "planner" || raw === "task") return "tasks";
  if (raw === "doc" || raw === "document") return "docs";
  if (raw === "calendar_gmail" || raw === "fit" || raw === "all") return raw;
  if (raw === "docs") return raw;
  if (raw === "tasks") return raw;
  return null;
}

function getScopesForPurpose(purpose) {
  const normalized = normalizePurpose(purpose);
  if (normalized && PURPOSE_SCOPES[normalized]) {
    return PURPOSE_SCOPES[normalized];
  }

  // Backward compatibility: if GOOGLE_OAUTH_SCOPES is explicitly configured, it wins.
  return getScopes();
}

function getGoogleAuthUrl(state, { purpose = null } = {}) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // Let users link multiple accounts without fighting cached sessions.
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: getScopesForPurpose(purpose),
    state
  });
}

async function getTokensFromCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

function toExpiryDateMs(tokenExpiry) {
  if (!tokenExpiry) return undefined;
  if (typeof tokenExpiry === "number" && Number.isFinite(tokenExpiry)) {
    return tokenExpiry;
  }
  const parsed = new Date(tokenExpiry);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function buildAuthedClient({ accessToken, refreshToken, tokenExpiry = null }) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
    expiry_date: toExpiryDateMs(tokenExpiry)
  });
  return client;
}

module.exports = {
  google,
  ensureGoogleOauthConfig,
  getGoogleAuthUrl,
  getTokensFromCode,
  buildAuthedClient,
  getScopesForPurpose
};

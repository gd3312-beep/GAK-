const { google } = require("googleapis");

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

  return [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/fitness.activity.write",
    "https://www.googleapis.com/auth/fitness.activity.read",
    // Needed for heart-rate (com.google.heart_rate.bpm) aggregates.
    "https://www.googleapis.com/auth/fitness.body.read"
  ];
}

function getGoogleAuthUrl(state) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: getScopes(),
    state
  });
}

async function getTokensFromCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

function buildAuthedClient({ accessToken, refreshToken }) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined
  });
  return client;
}

module.exports = {
  google,
  ensureGoogleOauthConfig,
  getGoogleAuthUrl,
  getTokensFromCode,
  buildAuthedClient
};

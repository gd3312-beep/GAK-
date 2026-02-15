const { google } = require("googleapis");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getScopes() {
  return [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
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
  getGoogleAuthUrl,
  getTokensFromCode,
  buildAuthedClient
};

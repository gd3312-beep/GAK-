const crypto = require("crypto");

const STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret() {
  const raw = String(process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || "").trim();
  if (raw) {
    return raw;
  }
  return "dev_oauth_state_secret_change_me_32_chars";
}

function base64urlJsonEncode(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function base64urlJsonDecode(value) {
  const parsed = Buffer.from(String(value), "base64url").toString("utf8");
  return JSON.parse(parsed);
}

function signBody(body) {
  return crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function createOAuthStateToken({ userId, nonce, ttlMs = STATE_TTL_MS }) {
  const now = Date.now();
  const payload = {
    userId,
    nonce,
    iat: now,
    exp: now + Math.max(30_000, Number(ttlMs || STATE_TTL_MS))
  };
  const body = base64urlJsonEncode(payload);
  const signature = signBody(body);
  return `${body}.${signature}`;
}

function verifyOAuthStateToken(stateToken) {
  const raw = String(stateToken || "");
  const splitAt = raw.lastIndexOf(".");
  if (splitAt <= 0) {
    throw new Error("Invalid OAuth state format");
  }

  const body = raw.slice(0, splitAt);
  const signature = raw.slice(splitAt + 1);
  const expectedSignature = signBody(body);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = base64urlJsonDecode(body);
  const now = Date.now();
  if (!payload?.userId || !payload?.nonce || !payload?.exp) {
    throw new Error("Invalid OAuth state payload");
  }
  if (now > Number(payload.exp)) {
    throw new Error("Expired OAuth state");
  }

  return {
    userId: String(payload.userId),
    nonce: String(payload.nonce),
    issuedAt: Number(payload.iat || 0),
    expiresAt: Number(payload.exp)
  };
}

module.exports = {
  STATE_TTL_MS,
  createOAuthStateToken,
  verifyOAuthStateToken
};

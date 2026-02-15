const jwt = require("jsonwebtoken");

const MIN_SECRET_LENGTH = 32;

function readPrimarySecret() {
  const configured = String(process.env.JWT_SECRET || "").trim();
  if (configured) {
    return configured;
  }

  return "dev_only_change_me_jwt_secret_minimum_32_chars";
}

function readPreviousSecrets() {
  return String(process.env.JWT_SECRET_PREVIOUS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function isStrongSecret(secret) {
  const value = String(secret || "");
  return value.length >= MIN_SECRET_LENGTH;
}

function assertJwtSecretsForRuntime() {
  const runtime = String(process.env.NODE_ENV || "development").toLowerCase();
  const primary = readPrimarySecret();
  const previous = readPreviousSecrets();

  if (!isStrongSecret(primary)) {
    const message = `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} chars`;
    if (runtime === "production") {
      throw new Error(message);
    }
    console.warn(`[security] ${message} (development only warning)`);
  }

  for (const oldSecret of previous) {
    if (!isStrongSecret(oldSecret)) {
      const message = `JWT_SECRET_PREVIOUS entries should be at least ${MIN_SECRET_LENGTH} chars`;
      if (runtime === "production") {
        throw new Error(message);
      }
      console.warn(`[security] ${message} (development only warning)`);
      break;
    }
  }
}

function getSigningSecret() {
  return readPrimarySecret();
}

function getVerificationSecrets() {
  return unique([readPrimarySecret(), ...readPreviousSecrets()]);
}

function signAuthToken(payload, options = {}) {
  return jwt.sign(payload, getSigningSecret(), { expiresIn: "1d", ...options });
}

function verifyAuthToken(token) {
  const secrets = getVerificationSecrets();
  let lastError = null;

  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Invalid token");
}

module.exports = {
  assertJwtSecretsForRuntime,
  signAuthToken,
  verifyAuthToken
};

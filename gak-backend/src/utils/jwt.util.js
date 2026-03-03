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

function hasPlaceholderSecret(secret) {
  const value = String(secret || "").toLowerCase();
  return value.includes("change_me") || value.includes("replace_with") || value.includes("default_dev");
}

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function shouldEnforceClaims() {
  const raw = String(process.env.JWT_ENFORCE_CLAIMS || "").toLowerCase().trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return isProd();
}

function getJwtIssuer() {
  return String(process.env.JWT_ISSUER || "gak-backend").trim();
}

function getJwtAudience() {
  return String(process.env.JWT_AUDIENCE || "gak-client").trim();
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

  if (runtime === "production") {
    if (hasPlaceholderSecret(primary)) {
      throw new Error("JWT_SECRET must not use placeholder values in production");
    }
    if (previous.some((oldSecret) => hasPlaceholderSecret(oldSecret))) {
      throw new Error("JWT_SECRET_PREVIOUS must not use placeholder values in production");
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
  const claims = shouldEnforceClaims()
    ? { issuer: getJwtIssuer(), audience: getJwtAudience() }
    : {};

  return jwt.sign(payload, getSigningSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
    algorithm: "HS256",
    ...claims,
    ...options
  });
}

function verifyAuthToken(token) {
  const secrets = getVerificationSecrets();
  const verifyOptions = {
    algorithms: ["HS256"]
  };
  if (shouldEnforceClaims()) {
    verifyOptions.issuer = getJwtIssuer();
    verifyOptions.audience = getJwtAudience();
  }
  let lastError = null;

  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, verifyOptions);
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

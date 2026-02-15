function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isStrong(value, min = 32) {
  return String(value || "").trim().length >= min;
}

function warnOrThrow(message) {
  if (isProd()) {
    throw new Error(message);
  }
  console.warn(`[security] ${message} (development warning)`);
}

function parseCsv(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function assertSecurityRuntimeConfig() {
  const enforceHttps = String(process.env.ENFORCE_HTTPS || "").toLowerCase() === "true";
  if (isProd() && !enforceHttps) {
    warnOrThrow("ENFORCE_HTTPS must be true in production");
  }

  const corsOrigins = parseCsv(process.env.CORS_ORIGINS || process.env.FRONTEND_URL);
  if (corsOrigins.length === 0 || corsOrigins.includes("*")) {
    warnOrThrow("CORS_ORIGINS must be explicit and must not contain '*'");
  }

  if (!isStrong(process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET)) {
    warnOrThrow("OAUTH_STATE_SECRET should be at least 32 chars");
  }

  const keyEntries = parseCsv(process.env.TOKEN_ENCRYPTION_KEYS);
  if (keyEntries.length > 0) {
    const weakEntry = keyEntries.some((entry) => {
      const idx = entry.indexOf(":");
      if (idx <= 0) return true;
      return !isStrong(entry.slice(idx + 1));
    });
    if (weakEntry) {
      warnOrThrow("Each TOKEN_ENCRYPTION_KEYS entry must be 'keyId:secret' with >=32-char secret");
    }
  } else if (!isStrong(process.env.GOOGLE_TOKEN_SECRET)) {
    warnOrThrow("GOOGLE_TOKEN_SECRET must be at least 32 chars when TOKEN_ENCRYPTION_KEYS is not set");
  }

  const frontendRedirects = parseCsv(process.env.FRONTEND_ALLOWED_REDIRECTS || process.env.FRONTEND_URL);
  if (frontendRedirects.length === 0) {
    warnOrThrow("FRONTEND_ALLOWED_REDIRECTS should define allowed callback redirect origins");
  }

  const googleRedirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  const googleAllowed = parseCsv(process.env.GOOGLE_ALLOWED_REDIRECT_URIS);
  if (googleAllowed.length > 0 && googleRedirectUri && !googleAllowed.includes(googleRedirectUri)) {
    warnOrThrow("GOOGLE_REDIRECT_URI must be present in GOOGLE_ALLOWED_REDIRECT_URIS");
  }
}

module.exports = {
  assertSecurityRuntimeConfig
};

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isStrong(value, min = 32) {
  return String(value || "").trim().length >= min;
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function isLocalhostUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch (_error) {
    return false;
  }
}

function hasPlaceholderValue(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) {
    return true;
  }
  return (
    v.includes("change_me")
    || v.includes("replace_with")
    || v.includes("dummy")
    || v.includes("default_dev")
    || v.includes("example")
  );
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
  if (isProd()) {
    if (corsOrigins.some((origin) => !isHttpsUrl(origin))) {
      warnOrThrow("CORS_ORIGINS must use https in production");
    }
    if (corsOrigins.some((origin) => isLocalhostUrl(origin))) {
      warnOrThrow("CORS_ORIGINS must not use localhost in production");
    }
  }

  if (!isStrong(process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET)) {
    warnOrThrow("OAUTH_STATE_SECRET should be at least 32 chars");
  }
  if (!String(process.env.OAUTH_STATE_SECRET || "").trim()) {
    warnOrThrow("Set OAUTH_STATE_SECRET explicitly instead of relying on JWT_SECRET fallback");
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
    if (isProd() && keyEntries.some((entry) => hasPlaceholderValue(entry.slice(entry.indexOf(":") + 1)))) {
      warnOrThrow("TOKEN_ENCRYPTION_KEYS must not contain placeholder values in production");
    }
  } else if (!isStrong(process.env.GOOGLE_TOKEN_SECRET)) {
    warnOrThrow("GOOGLE_TOKEN_SECRET must be at least 32 chars when TOKEN_ENCRYPTION_KEYS is not set");
  } else if (isProd() && hasPlaceholderValue(process.env.GOOGLE_TOKEN_SECRET)) {
    warnOrThrow("GOOGLE_TOKEN_SECRET must not be a placeholder in production");
  }

  const frontendRedirects = parseCsv(process.env.FRONTEND_ALLOWED_REDIRECTS || process.env.FRONTEND_URL);
  if (frontendRedirects.length === 0) {
    warnOrThrow("FRONTEND_ALLOWED_REDIRECTS should define allowed callback redirect origins");
  }
  if (isProd()) {
    if (frontendRedirects.some((url) => !isHttpsUrl(url))) {
      warnOrThrow("FRONTEND_ALLOWED_REDIRECTS must use https in production");
    }
    if (frontendRedirects.some((url) => isLocalhostUrl(url))) {
      warnOrThrow("FRONTEND_ALLOWED_REDIRECTS must not use localhost in production");
    }
  }

  const googleRedirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  const googleAllowed = parseCsv(process.env.GOOGLE_ALLOWED_REDIRECT_URIS);
  if (googleAllowed.length > 0 && googleRedirectUri && !googleAllowed.includes(googleRedirectUri)) {
    warnOrThrow("GOOGLE_REDIRECT_URI must be present in GOOGLE_ALLOWED_REDIRECT_URIS");
  }
  if (isProd()) {
    if (!googleRedirectUri || !isHttpsUrl(googleRedirectUri) || isLocalhostUrl(googleRedirectUri)) {
      warnOrThrow("GOOGLE_REDIRECT_URI must be https and non-localhost in production");
    }
    if (googleAllowed.some((uri) => !isHttpsUrl(uri) || isLocalhostUrl(uri))) {
      warnOrThrow("GOOGLE_ALLOWED_REDIRECT_URIS must only contain https non-localhost URIs in production");
    }
  }

  if (isProd()) {
    if (hasPlaceholderValue(process.env.GOOGLE_CLIENT_ID)) {
      warnOrThrow("GOOGLE_CLIENT_ID must be configured with a real value in production");
    }
    if (hasPlaceholderValue(process.env.GOOGLE_CLIENT_SECRET)) {
      warnOrThrow("GOOGLE_CLIENT_SECRET must be configured with a real value in production");
    }
    const openaiMode = String(process.env.NUTRITION_ANALYSIS_MODE || "dummy").trim().toLowerCase();
    if (openaiMode === "openai" && hasPlaceholderValue(process.env.OPENAI_API_KEY)) {
      warnOrThrow("OPENAI_API_KEY must be a real key when NUTRITION_ANALYSIS_MODE=openai in production");
    }
  }
}

module.exports = {
  assertSecurityRuntimeConfig
};

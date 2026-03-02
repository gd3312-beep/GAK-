const { randomUUID, randomBytes } = require("crypto");

function normalizePrefix(prefix, fallback = "id") {
  const text = String(prefix || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
}

function createId(prefix = "id") {
  const scoped = normalizePrefix(prefix);
  const compactUuid = randomUUID().replace(/-/g, "");
  return `${scoped}_${compactUuid}`;
}

function createNonce(bytes = 24, prefix = null) {
  const safeBytes = Number.isFinite(Number(bytes)) ? Math.max(16, Math.min(64, Math.trunc(Number(bytes)))) : 24;
  const token = randomBytes(safeBytes).toString("base64url");
  if (!prefix) return token;
  return `${normalizePrefix(prefix)}_${token}`;
}

module.exports = {
  createId,
  createNonce
};

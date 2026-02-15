const crypto = require("crypto");

function parseKeyEntries() {
  const rotated = String(process.env.TOKEN_ENCRYPTION_KEYS || "")
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx <= 0) {
        return null;
      }
      return {
        id: entry.slice(0, idx).trim(),
        secret: entry.slice(idx + 1).trim()
      };
    })
    .filter((item) => item && item.id && item.secret);

  if (rotated.length > 0) {
    return rotated;
  }

  const legacy = String(process.env.GOOGLE_TOKEN_SECRET || "default_dev_key_change_me_32_chars");
  return [{ id: "legacy", secret: legacy }];
}

function toCryptoKey(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest();
}

function parseEncryptedPayload(payload) {
  const raw = String(payload || "");
  const idx = raw.indexOf(".");
  if (idx <= 0) {
    return { keyId: null, encoded: raw };
  }
  return { keyId: raw.slice(0, idx), encoded: raw.slice(idx + 1) };
}

function decryptWithKey(encoded, key) {
  const input = Buffer.from(encoded, "base64");
  const iv = input.subarray(0, 16);
  const tag = input.subarray(16, 32);
  const encrypted = input.subarray(32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function encrypt(text) {
  if (!text) {
    return null;
  }

  const [active] = parseKeyEntries();
  const iv = crypto.randomBytes(16);
  const key = toCryptoKey(active.secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `${active.id}.${body}`;
}

function decrypt(payload) {
  if (!payload) {
    return null;
  }

  const entries = parseKeyEntries();
  const { keyId, encoded } = parseEncryptedPayload(payload);

  const tryEntries = keyId
    ? entries.filter((entry) => entry.id === keyId).concat(entries.filter((entry) => entry.id !== keyId))
    : entries;

  let lastError = null;
  for (const entry of tryEntries) {
    try {
      return decryptWithKey(encoded, toCryptoKey(entry.secret));
    } catch (error) {
      lastError = error;
    }
  }

  // Backward compatibility with old payloads stored as raw base64 without prefix.
  if (keyId !== null) {
    for (const entry of entries) {
      try {
        return decryptWithKey(String(payload), toCryptoKey(entry.secret));
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error("Unable to decrypt payload");
}

module.exports = {
  encrypt,
  decrypt
};

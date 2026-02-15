const crypto = require("crypto");

function buildKey() {
  const raw = process.env.GOOGLE_TOKEN_SECRET || "default_dev_key_change_me_32_chars";
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(text) {
  if (!text) {
    return null;
  }

  const iv = crypto.randomBytes(16);
  const key = buildKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(payload) {
  if (!payload) {
    return null;
  }

  const input = Buffer.from(payload, "base64");
  const iv = input.subarray(0, 16);
  const tag = input.subarray(16, 32);
  const encrypted = input.subarray(32);

  const key = buildKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = {
  encrypt,
  decrypt
};

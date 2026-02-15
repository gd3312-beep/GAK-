import crypto from "crypto";

import { env } from "../config/env";

const algorithm = "aes-256-gcm";
const key = Buffer.from(env.GOOGLE_ENCRYPTION_KEY.slice(0, 32));

export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(cipherText: string): string {
  const buff = Buffer.from(cipherText, "base64");
  const iv = buff.subarray(0, 16);
  const authTag = buff.subarray(16, 32);
  const encrypted = buff.subarray(32);

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

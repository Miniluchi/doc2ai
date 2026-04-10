import crypto from "crypto";
import fs from "fs";
import config from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Pour GCM
const TAG_LENGTH = 16;
const ENCODING = "base64";

export function encryptCredentials(data) {
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, config.encryptionKey, iv);

    let encrypted = cipher.update(text, "utf8", ENCODING);
    encrypted += cipher.final(ENCODING);

    const tag = cipher.getAuthTag();

    const result = Buffer.concat([
      iv,
      tag,
      Buffer.from(encrypted, ENCODING),
    ]).toString(ENCODING);

    return result;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt credentials");
  }
}

export function decryptCredentials(encryptedData) {
  try {
    if (!encryptedData) {
      throw new Error("No encrypted data provided");
    }

    const buffer = Buffer.from(encryptedData, ENCODING);
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer
      .subarray(IV_LENGTH + TAG_LENGTH)
      .toString(ENCODING);

    const decipher = crypto.createDecipheriv(ALGORITHM, config.encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, ENCODING, "utf8");
    decrypted += decipher.final("utf8");

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt credentials");
  }
}

export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, hashedPassword) {
  try {
    const [salt, hash] = hashedPassword.split(":");
    const verifyHash = crypto
      .pbkdf2Sync(password, salt, 10000, 64, "sha512")
      .toString("hex");
    return hash === verifyHash;
  } catch (error) {
    console.error("Password verification failed:", error);
    return false;
  }
}

export async function generateFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");

    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => {
      hash.update(data);
    });

    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}

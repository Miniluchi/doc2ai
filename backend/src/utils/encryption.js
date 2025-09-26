import crypto from "crypto";
import fs from "fs";
import config from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Pour GCM
const TAG_LENGTH = 16;
const ENCODING = "base64";

/**
 * Chiffre des données sensibles (credentials, tokens)
 * @param {string|object} data - Données à chiffrer
 * @returns {string} - Données chiffrées encodées en base64
 */
export function encryptCredentials(data) {
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);

    // Générer un IV aléatoire
    const iv = crypto.randomBytes(IV_LENGTH);

    // Créer le cipher
    const cipher = crypto.createCipher(ALGORITHM, config.encryptionKey, iv);

    // Chiffrer les données
    let encrypted = cipher.update(text, "utf8", ENCODING);
    encrypted += cipher.final(ENCODING);

    // Obtenir le tag d'authentification (pour GCM)
    const tag = cipher.getAuthTag();

    // Combiner IV + tag + données chiffrées
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

/**
 * Déchiffre des données
 * @param {string} encryptedData - Données chiffrées en base64
 * @returns {string|object} - Données déchiffrées
 */
export function decryptCredentials(encryptedData) {
  try {
    if (!encryptedData) {
      throw new Error("No encrypted data provided");
    }

    // Décoder les données
    const buffer = Buffer.from(encryptedData, ENCODING);

    // Extraire IV, tag et données chiffrées
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer
      .subarray(IV_LENGTH + TAG_LENGTH)
      .toString(ENCODING);

    // Créer le decipher
    const decipher = crypto.createDecipher(ALGORITHM, config.encryptionKey, iv);
    decipher.setAuthTag(tag);

    // Déchiffrer
    let decrypted = decipher.update(encrypted, ENCODING, "utf8");
    decrypted += decipher.final("utf8");

    // Essayer de parser en JSON, sinon retourner la string
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

/**
 * Génère une clé de chiffrement aléatoire de 32 caractères
 * @returns {string} - Clé de chiffrement
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hache un mot de passe avec salt
 * @param {string} password - Mot de passe à hacher
 * @returns {string} - Hash du mot de passe
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Vérifie un mot de passe contre son hash
 * @param {string} password - Mot de passe à vérifier
 * @param {string} hashedPassword - Hash stocké
 * @returns {boolean} - True si le mot de passe correspond
 */
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

/**
 * Génère un checksum MD5 pour un fichier
 * @param {string} filePath - Chemin vers le fichier
 * @returns {Promise<string>} - Checksum MD5
 */
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

interface GoogleCredentials {
  refreshToken: string;
  email: string;
  name: string;
  photoLink?: string;
  expiresAt?: number;
}

const STORAGE_KEY = "doc2ai_google_credentials";
const TOKEN_EXPIRY_HOURS = 24; // Les tokens expirent après 24h

export class TokenStorage {
  static saveCredentials(credentials: GoogleCredentials): void {
    try {
      const dataToStore = {
        ...credentials,
        expiresAt: Date.now() + (TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (error) {
      console.error("Failed to save credentials:", error);
    }
  }

  static getCredentials(): GoogleCredentials | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const credentials: GoogleCredentials = JSON.parse(stored);

      // Vérifier si le token n'a pas expiré
      if (credentials.expiresAt && Date.now() > credentials.expiresAt) {
        this.clearCredentials();
        return null;
      }

      return credentials;
    } catch (error) {
      console.error("Failed to get credentials:", error);
      this.clearCredentials();
      return null;
    }
  }

  static clearCredentials(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear credentials:", error);
    }
  }

  static hasValidCredentials(): boolean {
    const credentials = this.getCredentials();
    return credentials !== null && !!credentials.refreshToken;
  }

  static updateCredentials(updates: Partial<GoogleCredentials>): void {
    const existing = this.getCredentials();
    if (existing) {
      this.saveCredentials({ ...existing, ...updates });
    }
  }
}

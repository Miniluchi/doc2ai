import { useEffect, useState } from "react";
import { TokenStorage } from "../services/tokenStorage";

interface GoogleUser {
  email: string;
  name: string;
  photoLink?: string;
  refreshToken: string;
}

interface UseGoogleAuthReturn {
  isConnecting: boolean;
  user: GoogleUser | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

export function useGoogleAuth(): UseGoogleAuthReturn {
  const [isConnecting, setIsConnecting] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vérifier s'il y a des données d'authentification au chargement
  useEffect(() => {
    const checkAuthData = () => {
      try {
        // D'abord vérifier s'il y a des credentials persistés
        const storedCredentials = TokenStorage.getCredentials();
        if (storedCredentials) {
          setUser({
            email: storedCredentials.email,
            name: storedCredentials.name,
            photoLink: storedCredentials.photoLink,
            refreshToken: storedCredentials.refreshToken,
          });
          return; // On a trouvé des credentials valides, pas besoin de vérifier OAuth callback
        }

        // Sinon, vérifier s'il y a des nouvelles données d'auth (callback OAuth)
        const authData = localStorage.getItem("google_auth_data");
        if (authData) {
          const parsedData = JSON.parse(authData);
          const userCredentials = {
            email: parsedData.user.email,
            name: parsedData.user.name,
            photoLink: parsedData.user.photoLink,
            refreshToken: parsedData.refresh_token,
          };

          setUser(userCredentials);

          // Persister les credentials pour les prochaines fois
          TokenStorage.saveCredentials(userCredentials);

          // Nettoyer les données temporaires du callback
          localStorage.removeItem("google_auth_data");
        }

        // Vérifier s'il y a une erreur d'authentification dans l'URL
        const urlParams = new URLSearchParams(window.location.search);
        const authError = urlParams.get("auth_error");
        if (authError) {
          setError(authError);

          // Nettoyer l'URL
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete("auth_error");
          window.history.replaceState({}, "", newUrl.toString());
        }
      } catch (err) {
        console.error("Error checking auth data:", err);
      }
    };

    checkAuthData();
  }, []);

  const connect = async (): Promise<void> => {
    setIsConnecting(true);
    setError(null);

    try {
      // Générer l'URL d'autorisation via l'API
      const authResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/auth/google`,
      );
      const authData = await authResponse.json();

      if (!authData.success) {
        throw new Error(
          authData.message ||
            "Erreur lors de la génération de l'URL d'autorisation",
        );
      }

      // Rediriger directement vers Google (pas de popup)
      window.location.href = authData.data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setIsConnecting(false);
    }
  };

  const disconnect = (): void => {
    setUser(null);
    setError(null);
    TokenStorage.clearCredentials(); // Nettoyer les credentials persistés
  };

  return {
    isConnecting,
    user,
    connect,
    disconnect,
    error,
  };
}

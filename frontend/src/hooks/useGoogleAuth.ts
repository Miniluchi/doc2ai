import { useCallback, useEffect, useState } from 'react';
import { GOOGLE_TOKEN_EXPIRED_EVENT } from '../services/api';
import { TokenStorage } from '../services/tokenStorage';

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

  useEffect(() => {
    const checkAuthData = () => {
      try {
        const storedCredentials = TokenStorage.getCredentials();
        if (storedCredentials) {
          setUser({
            email: storedCredentials.email,
            name: storedCredentials.name,
            photoLink: storedCredentials.photoLink,
            refreshToken: storedCredentials.refreshToken,
          });
          return;
        }

        const authData = localStorage.getItem('google_auth_data');
        if (authData) {
          const parsedData = JSON.parse(authData);
          const userCredentials = {
            email: parsedData.user.email,
            name: parsedData.user.name,
            photoLink: parsedData.user.photoLink,
            refreshToken: parsedData.refresh_token,
          };

          setUser(userCredentials);
          TokenStorage.saveCredentials(userCredentials);
          localStorage.removeItem('google_auth_data');
        }

        const urlParams = new URLSearchParams(window.location.search);
        const authError = urlParams.get('auth_error');
        if (authError) {
          setError(authError);

          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('auth_error');
          window.history.replaceState({}, '', newUrl.toString());
        }
      } catch (err) {
        console.error('Error checking auth data:', err);
      }
    };

    checkAuthData();
  }, []);

  const disconnect = useCallback((): void => {
    setUser(null);
    setError(null);
    TokenStorage.clearCredentials();
  }, []);

  useEffect(() => {
    const handleTokenExpired = () => {
      console.warn('Google token expired, disconnecting...');
      disconnect();
      setError('Your Google session has expired, please reconnect');
    };

    window.addEventListener(GOOGLE_TOKEN_EXPIRED_EVENT, handleTokenExpired);
    return () => {
      window.removeEventListener(GOOGLE_TOKEN_EXPIRED_EVENT, handleTokenExpired);
    };
  }, [disconnect]);

  const connect = async (): Promise<void> => {
    setIsConnecting(true);
    setError(null);

    try {
      const authResponse = await fetch(`${import.meta.env.VITE_API_URL}/auth/google`);
      const authData = await authResponse.json();

      if (!authData.success) {
        throw new Error(authData.message || 'Error generating authorization URL');
      }

      window.location.href = authData.data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsConnecting(false);
    }
  };

  return {
    isConnecting,
    user,
    connect,
    disconnect,
    error,
  };
}

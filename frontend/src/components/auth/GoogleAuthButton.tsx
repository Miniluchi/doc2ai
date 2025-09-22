import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import React from "react";
import { useGoogleAuth } from "../../hooks/useGoogleAuth";

interface GoogleAuthButtonProps {
  onAuthSuccess?: (refreshToken: string, userEmail: string) => void;
  onAuthError?: (error: string) => void;
}

export function GoogleAuthButton({
  onAuthSuccess,
  onAuthError,
}: GoogleAuthButtonProps) {
  const { isConnecting, user, connect, disconnect, error } = useGoogleAuth();

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Erreur de connexion";
      onAuthError?.(errorMessage);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  // Effet pour notifier le parent quand l'authentification réussit
  React.useEffect(() => {
    if (user && onAuthSuccess) {
      onAuthSuccess(user.refreshToken, user.email);
    }
  }, [user, onAuthSuccess]);

  // Effet pour notifier le parent en cas d'erreur
  React.useEffect(() => {
    if (error && onAuthError) {
      onAuthError(error);
    }
  }, [error, onAuthError]);

  if (user) {
    return (
      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.photoLink || undefined} alt={user.name} />
            <AvatarFallback className="bg-green-100 text-green-700">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-green-800">{user.name}</p>
            <p className="text-xs text-green-600">{user.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-green-700 hover:text-green-900 hover:bg-green-100"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full h-12 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
        variant="outline"
      >
        {isConnecting ? (
          <>
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
            Connexion en cours...
          </>
        ) : (
          <>
            <div className="mr-3 h-5 w-5 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5">
                <path
                  fill="#4285f4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34a853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#fbbc05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#ea4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
            Se connecter avec Google
          </>
        )}
      </Button>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}
    </div>
  );
}

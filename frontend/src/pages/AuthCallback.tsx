import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import React, { useEffect } from "react";

const AuthCallback: React.FC = () => {
  useEffect(() => {
    const handleCallback = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const success = urlParams.get("success");
        const encodedData = urlParams.get("data");
        const error = urlParams.get("error");

        if (success === "true" && encodedData) {
          // Décoder les données
          const jsonData = atob(encodedData);
          const authData = JSON.parse(jsonData);

          console.log("Auth data received:", authData);

          // Stocker les données dans localStorage temporairement
          localStorage.setItem("google_auth_data", JSON.stringify(authData));

          // Envoyer un message à la fenêtre parent si c'est une popup
          if (window.opener) {
            window.opener.postMessage(
              {
                type: "GOOGLE_AUTH_SUCCESS",
                data: authData,
              },
              window.location.origin,
            );
            window.close();
          } else {
            // Rediriger vers la page principale après un délai
            setTimeout(() => {
              window.location.href = "/";
            }, 2000);
          }
        } else if (error) {
          console.error("Auth error:", error);

          if (window.opener) {
            window.opener.postMessage(
              {
                type: "GOOGLE_AUTH_ERROR",
                error: error,
              },
              window.location.origin,
            );
            window.close();
          } else {
            setTimeout(() => {
              window.location.href =
                "/?auth_error=" + encodeURIComponent(error);
            }, 2000);
          }
        }
      } catch (err) {
        console.error("Error processing auth callback:", err);

        if (window.opener) {
          window.opener.postMessage(
            {
              type: "GOOGLE_AUTH_ERROR",
              error: "Erreur lors du traitement de l'authentification",
            },
            window.location.origin,
          );
          window.close();
        }
      }
    };

    handleCallback();
  }, []);

  const urlParams = new URLSearchParams(window.location.search);
  const success = urlParams.get("success");
  const error = urlParams.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {success === "true" ? (
            <div className="space-y-6 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-green-800">
                  Authentification réussie !
                </h2>
                <p className="text-muted-foreground">
                  Votre compte Google a été connecté avec succès.
                </p>
              </div>
              <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Redirection automatique...</span>
              </div>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/")}
                className="w-full"
              >
                Retourner à l'application
              </Button>
            </div>
          ) : error ? (
            <div className="space-y-6 text-center">
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-destructive">
                  Erreur d'authentification
                </h2>
                <p className="text-muted-foreground">{error}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/")}
                className="w-full"
              >
                Retourner à l'application
              </Button>
            </div>
          ) : (
            <div className="space-y-6 text-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Traitement en cours...</h2>
                <p className="text-muted-foreground">
                  Veuillez patienter pendant que nous traitons votre
                  authentification.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;

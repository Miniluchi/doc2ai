import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, CheckCircle, Loader2, XCircle } from 'lucide-react';
import React, { useEffect } from 'react';

const AuthCallback: React.FC = () => {
  useEffect(() => {
    const handleCallback = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const success = urlParams.get('success');
        const encodedData = urlParams.get('data');
        const error = urlParams.get('error');

        if (success === 'true' && encodedData) {
          const jsonData = atob(encodedData);
          const authData = JSON.parse(jsonData);

          localStorage.setItem('google_auth_data', JSON.stringify(authData));

          if (window.opener) {
            window.opener.postMessage(
              {
                type: 'GOOGLE_AUTH_SUCCESS',
                data: authData,
              },
              window.location.origin,
            );
            window.close();
          } else {
            setTimeout(() => {
              window.location.href = '/';
            }, 2000);
          }
        } else if (error) {
          console.error('Auth error:', error);

          if (window.opener) {
            window.opener.postMessage(
              {
                type: 'GOOGLE_AUTH_ERROR',
                error: error,
              },
              window.location.origin,
            );
            window.close();
          } else {
            setTimeout(() => {
              window.location.href = '/?auth_error=' + encodeURIComponent(error);
            }, 2000);
          }
        }
      } catch (err) {
        console.error('Error processing auth callback:', err);

        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'GOOGLE_AUTH_ERROR',
              error: 'Error processing authentication',
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
  const success = urlParams.get('success');
  const error = urlParams.get('error');

  return (
    <div className="flex items-center justify-center flex-1">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {success === 'true' ? (
            <>
              <div className="mx-auto mb-2">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Authentication Successful</CardTitle>
              <CardDescription>
                Your Google account has been connected successfully.
              </CardDescription>
            </>
          ) : error ? (
            <>
              <div className="mx-auto mb-2">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle className="text-destructive">Authentication Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </>
          ) : (
            <>
              <div className="mx-auto mb-2">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>Processing...</CardTitle>
              <CardDescription>Please wait while we process your authentication.</CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {success === 'true' && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Redirecting...</span>
            </div>
          )}

          {(success === 'true' || error) && (
            <Button
              variant="outline"
              onClick={() => (window.location.href = '/')}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to application
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;

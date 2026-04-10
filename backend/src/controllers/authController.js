import axios from "axios";

class AuthController {
  // GET /api/auth/google/callback
  async googleCallback(req, res) {
    try {
      const { code, error } = req.query;

      if (error) {
        return res.status(400).json({
          success: false,
          message: "Authorization denied",
          error: error,
        });
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Missing authorization code",
          error: "No code parameter found in callback",
        });
      }

      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          code: code,
          grant_type: "authorization_code",
          redirect_uri:
            process.env.GOOGLE_REDIRECT_URI ||
            "http://localhost:3000/api/auth/google/callback",
        },
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const { access_token, refresh_token, expires_in, scope } =
        tokenResponse.data;

      if (!refresh_token) {
        return res.status(400).json({
          success: false,
          message: "No refresh token received",
          error:
            "Google did not provide a refresh token. Try adding prompt=consent to the authorization URL.",
          data: {
            access_token: access_token ? "received" : "missing",
            expires_in,
            scope,
          },
        });
      }

      try {
        const userInfoResponse = await axios.get(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          },
        );

        const userInfo = userInfoResponse.data.user;

        const successData = {
          refresh_token,
          access_token,
          expires_in,
          scope,
          user: {
            email: userInfo.emailAddress,
            name: userInfo.displayName,
            photoLink: userInfo.photoLink,
          },
        };

        const encodedData = Buffer.from(JSON.stringify(successData)).toString(
          "base64",
        );
        const frontendUrl = process.env.CORS_ORIGIN || "http://localhost:5173";

        return res.redirect(
          `${frontendUrl}/auth/callback?data=${encodedData}&success=true`,
        );
      } catch (userInfoError) {
        console.warn("Could not fetch user info:", userInfoError.message);

        const fallbackData = {
          refresh_token,
          access_token,
          expires_in,
          scope,
          user: {
            email: "unknown@gmail.com",
            name: "Google User",
            photoLink: null,
          },
        };

        const encodedFallbackData = Buffer.from(
          JSON.stringify(fallbackData),
        ).toString("base64");
        const frontendUrl = process.env.CORS_ORIGIN || "http://localhost:5173";

        return res.redirect(
          `${frontendUrl}/auth/callback?data=${encodedFallbackData}&success=true`,
        );
      }
    } catch (error) {
      console.error("Error in Google OAuth callback:", error);

      let errorMessage = "OAuth callback failed";
      let errorDetails = error.message;

      if (error.response?.data) {
        errorMessage =
          error.response.data.error_description ||
          error.response.data.error ||
          errorMessage;
        errorDetails = error.response.data;
      }

      res.status(500).json({
        success: false,
        message: errorMessage,
        error: errorDetails,
      });
    }
  }

  // GET /api/auth/google
  async getGoogleAuthUrl(req, res) {
    try {
      const baseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri:
          process.env.GOOGLE_REDIRECT_URI ||
          "http://localhost:3000/api/auth/google/callback",
        response_type: "code",
        scope: "https://www.googleapis.com/auth/drive",
        access_type: "offline",
        prompt: "consent",
      });

      const authUrl = `${baseUrl}?${params.toString()}`;

      res.json({
        success: true,
        message: "Google authorization URL generated",
        data: {
          authUrl,
          instructions: [
            "1. Open the authUrl in your browser",
            "2. Sign in to Google and authorize the application",
            "3. You will be redirected back with your tokens",
            "4. Copy the refresh_token from the response",
          ],
        },
      });
    } catch (error) {
      console.error("Error generating Google auth URL:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate authorization URL",
        error: error.message,
      });
    }
  }
}

export default AuthController;

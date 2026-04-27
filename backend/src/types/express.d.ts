// Augment Express Request with custom fields attached in middleware.
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId?: string;
      role?: string;
      permissions?: string[];
      [key: string]: unknown;
    };
    userInfo: {
      isAuthenticated: boolean;
      userId: string | null;
      role: string | null;
      [key: string]: unknown;
    };
  }
}

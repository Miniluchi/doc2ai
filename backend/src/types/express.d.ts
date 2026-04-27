// Augment the global Express namespace — the intended extension point in express-serve-static-core.
// core.Request extends Express.Request, so these fields are available on all Express requests.
namespace Express {
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

import { createAuth, createAuthAdmin } from "./src/middleware.js";

declare global {
  namespace Express {
    interface Request {
      auth: Awaited<ReturnType<typeof createAuth>>;
      authAdmin: ReturnType<typeof createAuthAdmin>;
    }
  }
}

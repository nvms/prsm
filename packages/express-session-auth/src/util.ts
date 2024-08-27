import ms from "@prsm/ms";
import cookieParser from "cookie-parser";
import { randomBytes } from "crypto";
import express from "express";
import session, { MemoryStore } from "express-session";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string) => emailRegex.test(email);

// const isMiddlewareUsed = (app: express.Application, name: string) =>
//   !!app._router.stack.filter(
//     (layer: { handle: { name: string } }) =>
//       layer && layer.handle && layer.handle.name === name,
//   ).length;

// export const ensureRequiredMiddlewares = (app: express.Application) => {
//   const requiredMiddlewares = [
//     {
//       name: "cookieParser",
//       handler: () => cookieParser(),
//     },
//     {
//       name: "session",
//       handler: () =>
//         session({
//           store: new MemoryStore({ captureRejections: true }),
//           name: "pine",
//           secret: randomBytes(32).toString("hex"),
//           resave: false,
//           saveUninitialized: true,
//           cookie: {
//             secure: process.env.NODE_ENV === "production",
//             maxAge: ms("30m"),
//             httpOnly: !(process.env.NODE_ENV === "production"),
//             sameSite: "lax",
//           },
//         }),
//     },
//   ];

//   for (const { name, handler } of requiredMiddlewares) {
//     if (!isMiddlewareUsed(app, name)) {
//       console.warn(
//         `Required middleware '${name}' not found. It will automatically be used and you may not agree with the default configuration.`,
//       );
//       app.use(handler());
//     }
//   }
// };

const isMiddlewareUsed = (app: express.Application, name: string) =>
  !!app._router.stack.filter(
    (layer: { handle: { name: string } }) =>
      layer && layer.handle && layer.handle.name === name,
  ).length;

export const ensureRequiredMiddlewares = (app: express.Application) => {
  const requiredMiddlewares = ["cookieParser", "session"];

  for (const name of requiredMiddlewares) {
    if (!isMiddlewareUsed(app, name)) {
      throw new Error(
        `Required middleware '${name}' not found. Please ensure it is added to your express application.`
      );
    }
  }
};

import express from "express";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string) => emailRegex.test(email);

const isMiddlewareUsed = (app: express.Application, name: string) =>
  !!app._router.stack.filter(
    (layer: { handle: { name: string } }) =>
      layer && layer.handle && layer.handle.name === name,
  ).length;

const warnedMiddlewares = new Set<string>();

export const ensureRequiredMiddlewares = (app: express.Application) => {
  const requiredMiddlewares = ["cookieParser", "session"];

  for (const name of requiredMiddlewares) {
    if (!isMiddlewareUsed(app, name) && !warnedMiddlewares.has(name)) {
      console.warn(
        `Required middleware '${name}' not found. Please ensure it is added to your express application.`,
      );
      warnedMiddlewares.add(name);
    }
  }
};

import { hash } from "@prsm/hash";
import ID from "@prsm/ids";
import ms from "@prsm/ms";
import type { Request, Response } from "express";
import { LessThanOrEqual, MoreThanOrEqual, type DataSource } from "typeorm";
import {
  ConfirmationExpiredError,
  ConfirmationNotFoundError,
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidEmailError,
  InvalidPasswordError,
  InvalidTokenError,
  InvalidUsernameError,
  ResetDisabledError,
  ResetExpiredError,
  ResetNotFoundError,
  TooManyResetsError,
  UserInactiveError,
  UsernameTakenError,
  UserNotFoundError,
  UserNotLoggedInError,
} from "./errors.js";
import { UserConfirmation } from "./user-confirmation.entity.js";
import { UserRemember } from "./user-remember.entity.js";
import { UserReset } from "./user-reset.entity.js";
import { AuthStatus, getRoleMap, getStatusMap, User } from "./user.entity.js";
import { ensureRequiredMiddlewares, isValidEmail } from "./util.js";

declare module "express-session" {
  export interface SessionData {
    auth: AuthSession;
  }
}

interface AuthenticatedRequest extends Request {
  auth: Awaited<ReturnType<typeof createAuth>>;
  authAdmin: ReturnType<typeof createAuthAdmin>;
}

type AuthSession = {
  loggedIn: boolean;
  userId: string;
  email: string;
  username: string;
  status: number;
  rolemask: number;
  remembered: boolean;
  lastResync: Date;
  lastRememberCheck: Date;
  forceLogout: number;
  verified: boolean;
};

type ReqResDatasource = {
  req: Request;
  res: Response;
  datasource: DataSource;
};

type TokenCallback = (token: string) => void;

type CreateUserOptions = {
  requireUsername: boolean;
  email: string;
  password: string;
  username?: string;
  callback?: TokenCallback;
};

const validateEmail = (email: string) => {
  if (typeof email !== "string") {
    throw new InvalidEmailError();
  }
  if (!email.trim()) {
    throw new InvalidEmailError();
  }
  if (!isValidEmail(email)) {
    throw new InvalidEmailError();
  }
};

const validatePassword = (password: string) => {
  const minLength = process.env.AUTH_MINIMUM_PASSWORD_LENGTH
    ? +process.env.AUTH_MINIMUM_PASSWORD_LENGTH
    : 8;

  const maxLength = process.env.AUTH_MAXIMUM_PASSWORD_LENGTH
    ? +process.env.AUTH_MAXIMUM_PASSWORD_LENGTH
    : 64;

  if (typeof password !== "string") {
    throw new InvalidPasswordError();
  }

  if (password.length < minLength) {
    throw new InvalidPasswordError();
  }

  if (password.length > maxLength) {
    throw new InvalidPasswordError();
  }
};

const createUserManager = ({ req, res, datasource }: ReqResDatasource) => {
  const userRepository = () => datasource.getRepository(User);
  const userConfirmationRepository = () =>
    datasource.getRepository(UserConfirmation);
  const userRememberRepository = () => datasource.getRepository(UserRemember);
  const userResetRepository = () => datasource.getRepository(UserReset);

  const getByUsername = (username: string) =>
    userRepository().findOne({ where: { username } });
  const getByEmail = (email: string) =>
    userRepository().findOne({ where: { email } });
  const getById = (id: number) => userRepository().findOne({ where: { id } });

  /**
   * Operates on session.auth.
   */
  const hasRole = async (role: number) => {
    if (req.session.auth) {
      return (req.session.auth.rolemask & role) === role;
    }

    const user = await getUser();
    return (user.rolemask & role) === role;
  };

  /**
   * Operates on session.auth.
   */
  const isRemembered = () => req.session.auth?.remembered ?? false;

  /**
   * Operates on session.auth.
   */
  const isAdmin = async () => hasRole(1);

  const getSessionProperty = (property: PropertyKey) => {
    return req.session?.auth ? req.session.auth[property] : null;
  };

  /** Returns the logged-in user's `id` property. */
  const getId = () =>
    getSessionProperty("userId")
      ? ID.decode(getSessionProperty("userId"))
      : null;

  /**
   * Operates on session.auth.
   * Returns the logged-in user's `email` property.
   */
  const getEmail = () => getSessionProperty("email");

  /**
   * Operates on session.auth.
   * Returns the logged-in user's `status` property.
   */
  const getStatus = (): number => getSessionProperty("status");

  /**
   * Operates on session.auth.
   * Returns the logged-in user's `verified` property.
   */
  const getVerified = (): number => getSessionProperty("verified");

  const getUsername = () => getSessionProperty("username");

  /**
   * Operates on session.auth.
   * Returns the logged-in user.
   */
  const getUser = async () => {
    const userId = getId();

    if (!userId) {
      return null;
    }

    const user = await userRepository().findOne({ where: { id: userId } });

    if (!user) {
      return null;
    }

    return user;
  };

  /**
   * Operates on session.auth.
   */
  const getRoleNames = (rolemask?: number) => {
    const mask =
      rolemask === undefined ? getSessionProperty("rolemask") : rolemask;

    if (!mask && mask !== 0) {
      return [];
    }

    return Object.entries(getRoleMap())
      .filter(([key, value]) => mask & parseInt(key))
      .map(([key, value]) => value);
  };

  /**
   * Operates on session.auth.
   */
  const getStatusName = () => {
    const status = getStatus();
    return getStatusMap()[status];
  };

  const createUserInternal = async ({
    requireUsername,
    email,
    password,
    username,
    callback,
  }: CreateUserOptions) => {
    validateEmail(email);
    validatePassword(password);

    const trimmedUsername = username?.trim();

    if (trimmedUsername === "") {
      throw new InvalidUsernameError();
    }

    if (requireUsername && trimmedUsername) {
      const existingUser = await getByUsername(username);

      if (existingUser) {
        throw new UsernameTakenError();
      }
    }

    const existingUser = await userRepository().findOne({ where: { email } });

    if (existingUser) {
      throw new EmailTakenError();
    }

    const hashedPassword = hash.encode(password);
    const verified = typeof callback !== "function";

    const user = userRepository().create({
      email,
      password: hashedPassword,
      username: trimmedUsername,
      verified,
      status: AuthStatus.Normal,
      resettable: true,
      rolemask: 0,
      registered: new Date(),
      lastLogin: null,
      forceLogout: 0,
    });

    await userRepository().save(user);

    if (!verified) {
      await createConfirmationToken(user, email, callback);
    }

    return user;
  };

  const createConfirmationToken = async (
    user: User,
    email: string,
    callback: TokenCallback,
  ) => {
    const token = hash.encode(email);
    const expires = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 7, // 1 week
    );

    await userConfirmationRepository().delete({ user });

    const confirmation = userConfirmationRepository().create({
      user,
      token,
      expires,
      email,
    });

    await userConfirmationRepository().save(confirmation);

    if (callback) {
      callback(token);
    }
  };

  const recreateConfirmationTokenForUserId = async (
    userId: number,
    callback: TokenCallback,
  ) => {
    const user = await getById(userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    return recreateConfirmationToken(user, callback);
  };

  const recreateConfirmationTokenForEmail = async (
    email: string,
    callback: TokenCallback,
  ) => {
    const user = await getByEmail(email);

    if (!user) {
      throw new UserNotFoundError();
    }

    return recreateConfirmationToken(user, callback);
  };

  const recreateConfirmationToken = async (
    user: User,
    callback: TokenCallback,
  ) => {
    const latestAttempt = await userConfirmationRepository().findOne({
      where: { user },
      order: { expires: "DESC" },
    });

    if (!latestAttempt) {
      throw new ConfirmationNotFoundError();
    }

    await createConfirmationToken(user, latestAttempt.email, callback);
  };

  const createRememberDirective = async (user: User) => {
    const token = hash.encode(user.email);
    const expires = new Date(
      Date.now() + ms(process.env.AUTH_SESSION_REMEMBER_DURATION),
    );

    await userRememberRepository().delete({ user });

    await userRememberRepository().insert({
      user,
      token,
      expires,
    });

    setRememberCookie(token, expires);

    return token;
  };

  const setRememberCookie = (token: string, expires: Date) => {
    const cookieName = process.env.AUTH_SESSION_REMEMBER_COOKIE_NAME;
    const cookieOptions = { expires, httpOnly: true, secure: false };
    res.cookie(cookieName, token, cookieOptions);
  };

  /**
   * Registers a new user with the provided email, password, and optional username.
   *
   * - When a callback is provided, the user's `verified` property will be set to `0` and a confirmation token will be created.
   *   The token will be passed to the callback. You should email the token to the user and have a route that accepts
   *   the token and then calls `confirmEmail` or `confirmEmailAndLogin` with it.
   *
   * @throws {InvalidEmailError} When the provided email is invalid.
   * @throws {InvalidPasswordError} When the provided password is invalid.
   * @throws {EmailTakenError} When the provided email is already in use.
   * @throws {InvalidUsernameError} When the provided username is invalid.
   */
  const register = async (
    email: string,
    password: string,
    username?: string,
    callback?: TokenCallback,
  ) =>
    createUserInternal({
      requireUsername: false,
      email,
      password,
      username,
      callback,
    });

  const registerWithUniqueUsername = async (
    email: string,
    password: string,
    username: string,
    callback: TokenCallback,
  ) =>
    createUserInternal({
      requireUsername: true,
      email,
      password,
      username,
      callback,
    });

  return {
    register,
    registerWithUniqueUsername,

    getId,
    getEmail,
    getStatus,
    getVerified,
    getUsername,
    getRoleNames,
    getStatusName,

    getUser,

    getById,
    getByEmail,
    getByUsername,

    userRepository,
    userResetRepository,
    userConfirmationRepository,
    userRememberRepository,

    setRememberCookie,
    createRememberDirective,

    createConfirmationToken,
    recreateConfirmationTokenForEmail,
    recreateConfirmationTokenForUserId,

    isAdmin,
    hasRole,
    isRemembered,
  };
};

export const createAuth = async ({
  req,
  res,
  datasource,
}: ReqResDatasource) => {
  if (!datasource) {
    throw new Error("datasource is required");
  }

  const um = createUserManager({ req, res, datasource });

  const isLoggedIn = () => req.session?.auth?.loggedIn ?? false;

  /**
   * Resynchronizes the session with the latest user data.
   *
   * - Does nothing if the user is not logged in.
   * - Resynchronizes only if the last resync was before the configured interval.
   * - Logs out the user if the user cannot be found.
   * - Logs out the user if the forceLogout value in the database is greater than the session's forceLogout value.
   *
   * @throws {Error} When session regeneration fails.
   */
  const resyncSession = async (force = false) => {
    if (!isLoggedIn()) {
      return;
    }

    const interval = ms(process.env.AUTH_SESSION_RESYNC_INTERVAL || "30m");

    const lastResync = new Date(req.session.auth.lastResync);

    if (!force && lastResync && lastResync.getTime() > Date.now() - interval) {
      return;
    }

    const user = await um.getUser();

    if (!user) {
      await logout();
      return;
    }

    if (user.forceLogout > req.session.auth.forceLogout) {
      await logout();
      return;
    }

    req.session.auth.email = user.email;
    req.session.auth.username = user.username;
    req.session.auth.status = user.status;
    req.session.auth.rolemask = user.rolemask;
    req.session.auth.verified = user.verified;
    req.session.auth.lastResync = new Date();
  };

  await resyncSession();

  const processRememberDirective = async () => {
    if (!isLoggedIn()) {
      return;
    }

    const { token } = getRememberToken();

    if (
      req.session.auth.lastRememberCheck &&
      Date.now() - new Date(req.session.auth.lastRememberCheck).getTime() < 5000
    ) {
      return;
    }

    req.session.auth.lastRememberCheck = new Date();

    if (!token) {
      return;
    }

    const directive = await um
      .userRememberRepository()
      .findOne({ where: { token } });

    if (!directive) {
      return;
    }

    if (!directive.user) {
      await logout();
      return;
    }

    // remove expired directives for this user
    const expiredRemembers = await um.userRememberRepository().find({
      where: { user: directive.user, expires: LessThanOrEqual(new Date()) },
    });
    await um.userRememberRepository().remove(expiredRemembers);

    // is this directive expired?
    if (new Date() > directive.expires) {
      await um.userRememberRepository().remove(directive);
      um.setRememberCookie(null, new Date(0));
      return;
    }

    // okay to login
    await onLoginSuccessful(directive.user, true);
  };

  /**
   * Logs in a user with the provided email and password.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided email.
   * @throws {InvalidPasswordError} When the provided password is incorrect.
   * @throws {EmailNotVerifiedError} When the user's email is not verified.
   * @throws {UserInactiveError} When the user's status is not normal.
   */
  const login = async (email: string, password: string, remember = false) =>
    loginWithCredentials({ email, password, remember });

  const loginWithCredentials = async (credentials: {
    email: string;
    password: string;
    username?: string;
    remember: boolean;
  }) => {
    const user = credentials.email
      ? await um.getByEmail(credentials.email)
      : await um.getByUsername(credentials.username);

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!hash.verify(user.password, credentials.password)) {
      throw new InvalidPasswordError();
    }

    if (!user.verified) {
      throw new EmailNotVerifiedError();
    }

    if (user.status !== AuthStatus.Normal) {
      throw new UserInactiveError();
    }

    await onLoginSuccessful(user, credentials.remember);
  };

  /**
   * Logs out the currently logged-in user.
   *
   * - Deletes the remember token if it exists.
   * - Clears the remember cookie.
   *
   * @throws {Error} When session regeneration fails.
   */
  const logout = async () => {
    if (!isLoggedIn()) {
      return;
    }

    const { token } = getRememberToken();

    if (token) {
      await um.userRememberRepository().delete({ token });
      um.setRememberCookie(null, new Date(0));
    }

    req.session.auth = undefined;
  };

  /**
   * Forces logout for a user identified by id.
   *
   * - Increments the forceLogout counter for the user.
   *
   * @throws {TypeError} When the provided id is not a number.
   */
  const forceLogoutForUserById = async (id: number) => {
    if (typeof id !== "number") {
      throw new TypeError("User ID must be a number");
    }

    await um.userRememberRepository().delete({ user: { id } });
    await um.userRepository().increment({ id }, "forceLogout", 1);
  };

  /**
   * Forces logout for the currently logged-in user.
   */
  const forceLogoutForUser = async () => {
    const userId = um.getId();

    if (userId) {
      await forceLogoutForUserById(userId);
    }
  };

  /**
   * Logs out the user from all sessions except the current one.
   *
   * - Increments the forceLogout counter for the user.
   * - Regenerates the session to apply the forceLogout change.
   *
   * Since this session's forceLogout value will not be greater than the
   * value in the database, the user will be logged out from all other sessions,
   * but not from the current one. See resyncSession for clarity on this behavior.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const logoutEverywhereElse = async () => {
    if (!isLoggedIn()) {
      return;
    }

    const userId = um.getId();

    const user = await um.getById(userId);

    if (!user) {
      await logout();
      return;
    }

    await forceLogoutForUserById(userId);

    req.session.auth.forceLogout += 1;

    await regenerate();
  };

  /**
   * Logs out the user from all sessions, including the current one.
   *
   * - Calls `logoutEverywhereElse` to log out from all other sessions.
   * - Calls `logout` to log out from the current session.
   *
   * @throws {Error} When session regeneration fails.
   */
  const logoutEverywhere = async () => {
    if (!isLoggedIn()) {
      return;
    }

    await logoutEverywhereElse();
    await logout();
  };

  /**
   * Regenerates the session while preserving the current auth data.
   *
   * - Copies the current session's auth data before regenerating the session.
   * - Restores the auth data to the new session.
   *
   * @throws {Error} When session regeneration fails.
   */
  const regenerate = async () => {
    const auth = { ...req.session.auth };

    return new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          reject(err);
          return;
        }
        req.session.auth = auth;
        resolve();
      });
    });
  };

  const getRememberToken = () => {
    if (!req.cookies) {
      return { token: null };
    }

    const cookieName = process.env.AUTH_SESSION_REMEMBER_COOKIE_NAME;
    const token = req.cookies[cookieName];

    if (!token) {
      return { token: null };
    }

    return { token };
  };

  const getRememberExpiry = async () => {
    if (!isLoggedIn()) {
      return;
    }

    const { token } = getRememberToken();

    if (!token) {
      return null;
    }

    const directive = await um
      .userRememberRepository()
      .findOne({ where: { token } });

    return directive?.expires ?? null;
  };

  /**
   * Handles successful login for a user.
   *
   * - Updates the user's last login timestamp.
   * - Regenerates the session to prevent session fixation attacks.
   * - Sets the session's auth data with user details.
   * - Creates a remember directive if the remember option is true.
   *
   * @throws {Error} When session regeneration fails.
   */
  const onLoginSuccessful = async (user: User, remember = false) => {
    await um.userRepository().update(user.id, { lastLogin: new Date() });

    return new Promise<void>((resolve, reject) => {
      if (!req.session?.regenerate) {
        resolve();
      }
      req.session.regenerate(async (err) => {
        if (err) {
          reject(err);
          return;
        }

        const session: AuthSession = {
          loggedIn: true,
          userId: ID.encode(user.id),
          email: user.email,
          username: user.username,
          status: user.status,
          rolemask: user.rolemask,
          remembered: remember,
          lastResync: new Date(),
          lastRememberCheck: new Date(),
          forceLogout: user.forceLogout,
          verified: user.verified,
        };

        req.session.auth = session;

        if (remember) {
          await um.createRememberDirective(user);
        }

        req.session.save((err) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });
    });
  };

  /**
   * Initiates an email change for the logged-in user.
   *
   * - Sends a confirmation token to the new email address.
   *
   * @throws {UserNotLoggedInError} When no user is currently logged in.
   * @throws {InvalidEmailError} When the provided email is invalid.
   * @throws {EmailTakenError} When the provided email is already in use.
   * @throws {UserNotFoundError} When the logged-in user cannot be found.
   * @throws {EmailNotVerifiedError} When the logged-in user's email is not verified.
   */
  const changeEmail = async (newEmail: string, callback: TokenCallback) => {
    if (!isLoggedIn()) {
      throw new UserNotLoggedInError();
    }

    validateEmail(newEmail);

    const existing = await um.getByEmail(newEmail);

    if (existing) {
      throw new EmailTakenError();
    }

    const user = await um.getById(um.getId());

    if (!user) {
      throw new UserNotFoundError();
    }

    if (!user.verified) {
      throw new EmailNotVerifiedError();
    }

    await um.createConfirmationToken(user, newEmail, callback);
  };

  /**
   * Confirms an email change using the provided token.
   *
   * @throws {ConfirmationNotFoundError} When the confirmation token cannot be found.
   * @throws {ConfirmationExpiredError} When the confirmation token has expired.
   * @throws {InvalidTokenError} When the provided token is invalid.
   */
  const confirmChangeEmail = async (token: string) => {
    const confirmation = await um.userConfirmationRepository().findOne({
      where: { token },
    });

    if (!confirmation) {
      throw new ConfirmationNotFoundError();
    }

    if (new Date(confirmation.expires) < new Date()) {
      throw new ConfirmationExpiredError();
    }

    if (!hash.verify(token, confirmation.email)) {
      throw new InvalidTokenError();
    }

    await um.userRepository().update(confirmation.user.id, {
      verified: true,
      email: confirmation.email,
    });

    if (
      isLoggedIn() &&
      req.session?.auth?.userId === ID.encode(confirmation.user.id)
    ) {
      req.session.auth.verified = true;
      req.session.auth.email = confirmation.email;
    }

    await um.userConfirmationRepository().remove(confirmation);

    return confirmation.email;
  };

  /**
   * Confirms an email change using the provided token.
   *
   * @throws {ConfirmationNotFoundError} When the confirmation token cannot be found.
   * @throws {ConfirmationExpiredError} When the confirmation token has expired.
   * @throws {InvalidTokenError} When the provided token is invalid.
   */
  const confirmEmail = async (token: string) => confirmChangeEmail(token);

  /**
   * Confirms an email change using the provided token and logs in the user.
   *
   * - Logs in the user if not already logged in.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided email.
   */
  const confirmEmailAndLogin = async (token: string) =>
    confirmChangeEmailAndLogin(token);

  /**
   * Confirms an email change using the provided token and logs in the user.
   *
   * - Logs in the user if not already logged in.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided email.
   */
  const confirmChangeEmailAndLogin = async (
    token: string,
    remember = false,
  ) => {
    const email = await confirmChangeEmail(token);

    if (isLoggedIn()) {
      return;
    }

    const user = await um.getByEmail(email);

    if (!user) {
      throw new UserNotFoundError();
    }

    await onLoginSuccessful(user, remember);
  };

  /**
   * Updates the password for the specified user.
   *
   * @throws {InvalidPasswordError} When the provided password is invalid.
   */
  const updatePasswordInternal = async (user: User, password: string) => {
    await um
      .userRepository()
      .update(user.id, { password: hash.encode(password) });
  };

  /**
   * Initiates a password reset for the user identified by email.
   *
   * - Limits the number of open reset requests to `maxOpenRequests`.
   *
   * @throws {EmailNotVerifiedError} When the user's email is not verified.
   * @throws {ResetDisabledError} When the user's reset functionality is disabled.
   * @throws {TooManyResetsError} When the user has too many open reset requests.
   */
  const resetPassword = async (
    email: string,
    expiresAfter: string | number | null,
    maxOpenRequests: number | null,
    callback?: TokenCallback,
  ) => {
    validateEmail(email);
    expiresAfter = !expiresAfter ? ms("6h") : ms(expiresAfter);
    maxOpenRequests =
      maxOpenRequests === null ? 2 : Math.max(1, maxOpenRequests);

    const user = await um.userRepository().findOne({ where: { email } });

    if (!user || !user.verified) {
      throw new EmailNotVerifiedError();
    }

    if (!user.resettable) {
      throw new ResetDisabledError();
    }

    // find all open, non-expired reset requests
    const openRequests = await um
      .userResetRepository()
      .find({ where: { user, expires: MoreThanOrEqual(new Date()) } });

    if (openRequests.length >= maxOpenRequests) {
      throw new TooManyResetsError();
    }

    const token = hash.encode(email);
    const expires = new Date(Date.now() + ms(expiresAfter));
    await um.userResetRepository().insert({ user, token, expires });
  };

  /**
   * Confirms a password reset using the provided token and sets a new password.
   *
   * - Logs out the user from all sessions if `logout` is true.
   *
   * @throws {ResetNotFoundError} When the reset token cannot be found.
   * @throws {ResetExpiredError} When the reset token has expired.
   * @throws {ResetDisabledError} When the user's reset functionality is disabled.
   * @throws {InvalidTokenError} When the provided token is invalid.
   * @throws {InvalidPasswordError} When the provided password is invalid.
   */
  const confirmResetPassword = async (
    token: string,
    password: string,
    logout = true,
  ) => {
    const reset = await um
      .userResetRepository()
      .findOne({ where: { token }, order: { expires: "DESC" } });

    if (!reset) {
      throw new ResetNotFoundError();
    }

    if (new Date(reset.expires) < new Date()) {
      throw new ResetExpiredError();
    }

    if (!reset.user.resettable) {
      throw new ResetDisabledError();
    }

    validatePassword(password);

    if (!hash.verify(token, reset.user.email)) {
      throw new InvalidTokenError();
    }

    await updatePasswordInternal(reset.user, password);

    if (logout) {
      await forceLogoutForUserById(reset.user.id);
    }

    await um.userResetRepository().remove(reset);
  };

  /**
   * Verifies the provided password against the logged-in user's password.
   *
   * @throws {UserNotLoggedInError} When no user is currently logged in.
   * @throws {UserNotFoundError} When the logged-in user cannot be found.
   */
  const verifyPassword = async (password: string) => {
    if (!isLoggedIn()) {
      throw new UserNotLoggedInError();
    }

    const user = await um.getUser();

    if (!user) {
      throw new UserNotFoundError();
    }

    return hash.verify(user.password, password);
  };

  return {
    processRememberDirective,
    resyncSession,

    forceLogoutForUser,
    forceLogoutForUserById,

    login,
    logout,
    logoutEverywhere,
    logoutEverywhereElse,

    register: um.register,

    changeEmail,
    confirmEmail,
    confirmEmailAndLogin,
    confirmChangeEmail,
    confirmChangeEmailAndLogin,

    resetPassword,
    confirmResetPassword,

    verifyPassword,

    isAdmin: um.isAdmin,
    hasRole: um.hasRole,

    isLoggedIn,
    isRemembered: um.isRemembered,

    getId: um.getId,
    getEmail: um.getEmail,
    getStatus: um.getStatus,
    getVerified: um.getVerified,
    getUsername: um.getUsername,
    getUser: um.getUser,
    getRoleNames: um.getRoleNames,
    getStatusName: um.getStatusName,

    userRepository: um.userRepository,
    userConfirmationRepository: um.userConfirmationRepository,
    userResetRepository: um.userResetRepository,
    userRememberRepository: um.userRememberRepository,

    onLoginSuccessful,

    getById: um.getById,
    getByEmail: um.getByEmail,
    getByUsername: um.getByUsername,
  };
};

export const createAuthAdmin = ({
  req,
  res,
  datasource,
  auth,
}: ReqResDatasource & { auth: Awaited<ReturnType<typeof createAuth>> }) => {
  const loginAsUser = async (user: User) => {
    await auth.onLoginSuccessful(user, false);
  };

  const loginAsUserBy = async (identifier: {
    id?: number;
    email?: string;
    username?: string;
  }) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth
        .userRepository()
        .findOne({ where: { id: identifier.id } });
    } else if (identifier.email !== undefined) {
      user = await auth
        .userRepository()
        .findOne({ where: { email: identifier.email } });
    } else if (identifier.username !== undefined) {
      user = await auth
        .userRepository()
        .findOne({ where: { username: identifier.username } });
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    await loginAsUser(user);
  };

  const createUserInternal = async (
    requireUniqueUsername: boolean,
    credentials: { email: string; password: string; username?: string },
    callback?: TokenCallback,
  ) => {
    validateEmail(credentials.email);
    validatePassword(credentials.password);

    if (credentials.username) {
      credentials.username = credentials.username.trim();
    }

    if (requireUniqueUsername) {
      if (!credentials.username) {
        throw new InvalidUsernameError();
      }

      const occurrences = await auth.userRepository().count({
        where: { username: credentials.username },
      });

      if (occurrences > 0) {
        throw new UsernameTakenError();
      }
    }

    const hashed = hash.encode(credentials.password);
    const verified = Boolean(callback);

    const user = await auth.userRepository().insert({
      email: credentials.email,
      password: hashed,
      username: credentials.username,
      verified,
      status: AuthStatus.Normal,
      resettable: true,
      rolemask: 0,
      registered: new Date(),
      lastLogin: null,
      forceLogout: 0,
    });
  };

  /**
   * Creates a new user with the provided credentials.
   *
   * @throws {InvalidEmailError} When the provided email is invalid.
   * @throws {InvalidPasswordError} When the provided password is invalid.
   * @throws {EmailTakenError} When the provided email is already in use.
   */
  const createUser = async (
    credentials: {
      email: string;
      password: string;
      username?: string;
    },
    callback?: TokenCallback,
  ) => {
    return createUserInternal(false, credentials, callback);
  };

  /**
   * Creates a new user with a unique username.
   *
   * - Ensures the username is unique before creating the user.
   *
   * @throws {InvalidEmailError} When the provided email is invalid.
   * @throws {InvalidPasswordError} When the provided password is invalid.
   * @throws {InvalidUsernameError} When the provided username is invalid.
   * @throws {UsernameTakenError} When the provided username is already in use.
   * @throws {EmailTakenError} When the provided email is already in use.
   */
  const createUserWithUniqueUsername = async (
    credentials: {
      email: string;
      password: string;
      username: string;
    },
    callback?: TokenCallback,
  ) => {
    return createUserInternal(true, credentials, callback);
  };

  const addRoleForUser = async (user: User, role: number) => {
    const rolemask = user.rolemask | role;
    await auth.userRepository().update(user.id, { rolemask });
  };

  /**
   * Adds a role for a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const addRoleForUserBy = async (
    identifier: { id?: number; email?: string; username?: string },
    role: number,
  ) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return addRoleForUser(user, role);
  };

  const removeRoleForUser = async (user: User, role: number) => {
    const rolemask = user.rolemask & ~role;
    await auth.userRepository().update(user.id, { rolemask });
  };

  /**
   * Removes a role for a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const removeRoleForUserBy = async (
    identifier: { id?: number; email?: string; username?: string },
    role: number,
  ) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return removeRoleForUser(user, role);
  };

  /**
   * Retrieves the roles for a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const getRolesForUserBy = async (identifier: {
    id?: number;
    email?: string;
    username?: string;
  }) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return auth.getRoleNames(user.rolemask);
  };

  /**
   * Checks if a user identified by id, email, or username has a specific role.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const hasRoleForUserBy = async (
    identifier: { id?: number; email?: string; username?: string },
    role: number,
  ) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return (user.rolemask & role) === role;
  };

  const deleteUser = async (user: User) => {
    await auth.userResetRepository().delete({ user });
    await auth.userRememberRepository().delete({ user });
    await auth.userConfirmationRepository().delete({ user });
    await auth.userRepository().delete(user);
  };

  /**
   * Deletes a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const deleteUserBy = async (identifier: {
    id?: number;
    email?: string;
    username?: string;
  }) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return deleteUser(user);
  };

  const changePasswordForUser = async (user: User, password: string) => {
    await auth
      .userRepository()
      .update(user.id, { password: hash.encode(password) });
  };

  /**
   * Changes the password for a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const changePasswordForUserBy = async (
    identifier: { id?: number; email?: string; username?: string },
    password: string,
  ) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return changePasswordForUser(user, password);
  };

  /**
   * Sets the status for a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const setStatusForUserBy = async (
    identifier: { id?: number; email?: string; username?: string },
    status: number,
  ) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return auth.userRepository().update(user.id, { status });
  };

  /**
   * Initiates a password reset for the user, but only if that user
   * has already verified their email address.
   *
   * - Ignores user.resettable (i.e., initiates reset regardless of this value).
   * - Doesn't care about how many open requests there currently are for this user.
   *
   * @throws {EmailNotVerifiedError} When the user's email is not verified.
   */
  const initiatePasswordResetForUser = async (
    user: User,
    expiresAfter: string | number | null,
    callback?: TokenCallback,
  ) => {
    if (!user.verified) {
      throw new EmailNotVerifiedError();
    }

    expiresAfter = !expiresAfter ? ms("6h") : ms(expiresAfter);
    const token = hash.encode(user.email);
    const expires = new Date(Date.now() + ms(expiresAfter));
    await auth.userResetRepository().insert({ user, token, expires });

    if (callback) {
      callback(token);
    }
  };

  /**
   * Initiates a password reset for a user identified by id, email, or username.
   *
   * @throws {UserNotFoundError} When the user cannot be found by the provided identifier.
   */
  const initiatePasswordResetForUserBy = async (
    identifier: { id?: number; email?: string; username?: string },
    expiresAfter: string | number | null,
    callback?: TokenCallback,
  ) => {
    let user: User | null = null;

    if (identifier.id !== undefined) {
      user = await auth.getById(identifier.id);
    } else if (identifier.email !== undefined) {
      user = await auth.getByEmail(identifier.email);
    } else if (identifier.username !== undefined) {
      user = await auth.getByUsername(identifier.username);
    }

    if (!user) {
      throw new UserNotFoundError();
    }

    return initiatePasswordResetForUser(user, expiresAfter, callback);
  };

  return {
    loginAsUserBy,
    createUser,
    createUserWithUniqueUsername,
    deleteUserBy,
    getRolesForUserBy,
    addRoleForUserBy,
    removeRoleForUserBy,
    hasRoleForUserBy,
    changePasswordForUserBy,
    setStatusForUserBy,
    initiatePasswordResetForUserBy,
  };
};

export const middleware = ({ datasource }: { datasource: DataSource }) => {
  return async (req: AuthenticatedRequest, res, next) => {
    ensureRequiredMiddlewares(req.app);
    req.auth = await createAuth({ req, res, datasource });
    req.authAdmin = createAuthAdmin({ req, res, datasource, auth: req.auth });
    await req.auth.processRememberDirective();
    next();
  };
};

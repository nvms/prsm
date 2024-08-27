export class ConfirmationNotFoundError extends Error {
  constructor(message: string = "Confirmation selector/token pair not found") {
    super(message);
    this.name = "ConfirmationNotFoundError";
  }
}

export class ConfirmationExpiredError extends Error {
  constructor(message: string = "Confirmation selector/token pair expired") {
    super(message);
    this.name = "ConfirmationExpiredError";
  }
}

export class EmailTakenError extends Error {
  constructor(message: string = "Email already exists") {
    super(message);
    this.name = "EmailTakenError";
  }
}

export class EmailNotVerifiedError extends Error {
  constructor(message: string = "User not verified") {
    super(message);
    this.name = "EmailNotVerifiedError";
  }
}

export class ImpersonationNotAllowedError extends Error {
  constructor(message: string = "Impersonation not allowed") {
    super(message);
    this.name = "ImpersonationNotAllowedError";
  }
}

export class InvalidEmailError extends Error {
  constructor(message: string = "Invalid email provided") {
    super(message);
    this.name = "InvalidEmailError";
  }
}

export class InvalidPasswordError extends Error {
  constructor(message: string = "Invalid password provided") {
    super(message);
    this.name = "InvalidPasswordError";
  }
}

export class InvalidTokenError extends Error {
  constructor(message: string = "Invalid selector/token pair provided") {
    super(message);
    this.name = "InvalidSelectorTokenPairError";
  }
}

export class InvalidUsernameError extends Error {
  constructor(message: string = "Invalid username provided") {
    super(message);
    this.name = "InvalidUsernameError";
  }
}

export class ResetDisabledError extends Error {
  constructor(message: string = "Password reset is disabled") {
    super(message);
    this.name = "ResetDisabledError";
  }
}

export class ResetExpiredError extends Error {
  constructor(message: string = "Reset request expired") {
    super(message);
    this.name = "ResetExpiredError";
  }
}

export class ResetNotFoundError extends Error {
  constructor(message: string = "Reset request not found") {
    super(message);
    this.name = "ResetNotFoundError";
  }
}

export class TooManyResetsError extends Error {
  constructor(message: string = "Too many resets") {
    super(message);
    this.name = "TooManyResetsError";
  }
}

export class UserInactiveError extends Error {
  constructor(message: string = "User is inactive") {
    super(message);
    this.name = "UserInactiveError";
  }
}

export class UserNotFoundError extends Error {
  constructor(message: string = "User not found") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class UserNotLoggedInError extends Error {
  constructor(message: string = "User not logged in") {
    super(message);
    this.name = "UserNotLoggedInError";
  }
}

export class UsernameTakenError extends Error {
  constructor(message: string = "Username already exists") {
    super(message);
    this.name = "UsernameTakenError";
  }
}

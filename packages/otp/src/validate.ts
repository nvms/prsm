import Otp from ".";

const totp = "355435"; // Replace with the TOTP generated by your authenticator app
// Loose validation
// const isValid = Otp.verifyTotp("IYKZRIYTTWVKXBDNG3VSY3FTQFEO3MWY", totp);
// Strict validation
const isValid = Otp.verifyTotp("IYKZRIYTTWVKXBDNG3VSY3FTQFEO3MWY", totp, 0, 0);
console.log("Is TOTP valid?", isValid);

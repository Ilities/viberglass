import rateLimit from "express-rate-limit";

const FAILED_SIGN_INS = 10;

/** Only failed sign-ins count, per address, so a password can't be guessed at speed. */
export function loginRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: FAILED_SIGN_INS,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many failed sign-ins. Try again in 15 minutes." },
  });
}

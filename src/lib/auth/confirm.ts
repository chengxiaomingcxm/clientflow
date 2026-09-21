import { DEFAULT_AUTHENTICATED_PATH, sanitizeNextPath } from "./redirect";

/**
 * Helpers for the email-confirmation callback (`/auth/confirm`).
 *
 * The callback is a plain GET, so every value it uses to build a redirect is
 * treated as untrusted input. Locations are always built as **relative paths**,
 * never absolute URLs: constructing an absolute URL would require trusting the
 * request's `Host` header, which is the classic host-header open-redirect. A
 * relative `Location` cannot leave the origin.
 */

/** Stable reason codes surfaced on the login page. Never upstream error text. */
export type ConfirmErrorCode = "invalid_link" | "unavailable";

const CONFIRM_ERROR_MESSAGES: Record<ConfirmErrorCode, string> = {
  invalid_link: "That confirmation link is invalid or has expired. Sign in, or ask for a new link.",
  unavailable: "We could not confirm your email address right now. Please try again in a moment.",
};

/** Where a successfully confirmed session should continue to. */
export function confirmSuccessLocation(next: unknown): string {
  return sanitizeNextPath(next) ?? DEFAULT_AUTHENTICATED_PATH;
}

/** Where a failed confirmation should land, carrying a safe reason code. */
export function confirmFailureLocation(code: ConfirmErrorCode): string {
  return `/login?confirm=${code}`;
}

/**
 * Resolves the `?confirm=` parameter for display.
 *
 * Only the two known codes produce a message, so an attacker cannot inject text
 * into the login page through the URL.
 */
export function describeConfirmError(value: unknown): string | null {
  if (value === "invalid_link" || value === "unavailable") {
    return CONFIRM_ERROR_MESSAGES[value];
  }

  return null;
}

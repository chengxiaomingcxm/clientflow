/**
 * Safe handling of the `next` redirect target.
 *
 * The `next` parameter is attacker-controllable (it arrives in a URL or a form
 * body), so it is never used verbatim. Only same-origin, absolute-path
 * references are accepted; everything else falls back to the default landing
 * page. This is what stops `//evil.example`, `/\evil.example`,
 * `https://evil.example`, `javascript:` and encoded variants of those from
 * turning the login/confirm screens into an open redirect.
 */

/** Where a signed-in user lands when no usable `next` value was supplied. */
export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

const LOGIN_PATH = "/login";

/** Maximum accepted length, matching `NEXT_PATH_MAX_LENGTH`. */
const MAX_LENGTH = 2048;

/**
 * Path, query and fragment characters only, and the value must start with a
 * single `/`. Whitespace, backslashes, angle brackets and control characters
 * are therefore impossible.
 */
const SAFE_PATH_PATTERN = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

/**
 * Returns `value` when it is a safe in-app path, otherwise `null`.
 *
 * The value is checked twice: as received, and again after percent-decoding, so
 * that `/%2F%2Fevil.example` cannot slip through.
 */
export function sanitizeNextPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const candidate = value.trim();

  if (candidate.length === 0 || candidate.length > MAX_LENGTH) {
    return null;
  }

  if (!isSafePath(candidate)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // Malformed percent-encoding: refuse rather than guess.
    return null;
  }

  if (decoded !== candidate && !isSafePath(decoded)) {
    return null;
  }

  return candidate;
}

/** {@link sanitizeNextPath} with a fallback, for redirect targets. */
export function resolveNextPath(value: unknown): string {
  return sanitizeNextPath(value) ?? DEFAULT_AUTHENTICATED_PATH;
}

/** Reads the first value of a (possibly repeated) search parameter. */
export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Builds the login URL that returns the visitor to `nextPathAfterLogin`. */
export function buildLoginPath(nextPathAfterLogin: string): string {
  const safePath = sanitizeNextPath(nextPathAfterLogin);

  if (!safePath) {
    return LOGIN_PATH;
  }

  return `${LOGIN_PATH}?next=${encodeURIComponent(safePath)}`;
}

function isSafePath(candidate: string): boolean {
  // Protocol-relative URLs ("//host") and backslash variants ("/\host") are
  // treated by browsers as absolute URLs, so they are rejected explicitly.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return false;
  }

  if (!candidate.startsWith("/")) {
    return false;
  }

  return SAFE_PATH_PATTERN.test(candidate);
}

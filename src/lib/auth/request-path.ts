/**
 * Request header used to pass the current pathname from the proxy to Server
 * Components.
 *
 * A Server Component layout cannot read its own URL, but the protected layout
 * needs it to send an unauthenticated visitor back where they were trying to go.
 * The proxy always *overwrites* this header with `request.nextUrl.pathname`, so
 * a client cannot inject a value; and even if one arrived, it is only ever used
 * as the argument of `sanitizeNextPath`, which rejects anything that is not a
 * same-origin path.
 */
export const PATHNAME_HEADER = "x-clientflow-pathname";

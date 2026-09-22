import type { NextConfig } from "next";

/**
 * ClientFlow Next.js configuration.
 *
 * `experimental.serverActions.allowedOrigins` lists the extra origin hosts that
 * may skip Next.js' Origin/Host comparison for Server Actions. Entries are
 * scheme-less `host[:port]` values matched against the `Origin` request header,
 * so they must include the port.
 *
 * In GitHub Codespaces the browser is served from `http://localhost:3000` while
 * the port-forwarding tunnel hands the request to the container with
 * `Host`/`x-forwarded-host` set to `<codespace>-3000.app.github.dev`. Those two
 * hosts differ, so Next.js aborts the action with "Invalid Server Actions
 * request." (E80) before the Server Action body is decoded. Allowing the two
 * same-machine origins restores the local development flow.
 *
 * The list is scoped to development on purpose:
 *
 * - Next.js applies this list in production as well, so committing localhost
 *   hosts would widen the Server Action CSRF boundary of the deployed app.
 * - In production no extra origin is configured. Server Actions fall back to the
 *   default Origin/Host comparison, which rejects every cross-origin request.
 * - There is no wildcard entry (`*`, `**`) and no public tunnel hostname, so the
 *   Origin/Host check stays fully enabled in both environments.
 *
 * `process.env.NODE_ENV` is set by the Next.js CLI before this file is loaded
 * (`development` for `next dev`, `production` for `next build`/`next start`).
 * Any other value - including an unset one - therefore fails closed and
 * configures no extra origin.
 */
const developmentServerActionOrigins = ["localhost:3000", "127.0.0.1:3000"];

const nextConfig: NextConfig =
  process.env.NODE_ENV === "development"
    ? {
        experimental: {
          serverActions: {
            allowedOrigins: developmentServerActionOrigins,
          },
        },
      }
    : {};

export default nextConfig;

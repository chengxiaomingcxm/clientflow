import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { DEFAULT_AUTHENTICATED_PATH, buildLoginPath } from "@/lib/auth/redirect";
import { PATHNAME_HEADER } from "@/lib/auth/request-path";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/user";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * Protected application shell.
 *
 * This is ClientFlow's **authorization boundary on the server**: nothing inside
 * the `(app)` route group is rendered unless Supabase Auth has verified the
 * current session.
 *
 * Every non-authenticated outcome redirects to `/login`, including "Supabase is
 * not configured" and "the Auth service is unreachable". That is deliberately
 * fail-closed — no protected content is ever produced — while keeping a single
 * place (`/login`) that explains *why* sign-in is not possible. The original path
 * travels along as `next` and is sanitised by `buildLoginPath` before use.
 *
 * The proxy refreshes cookies but makes no decisions here, and Row Level Security
 * remains the final boundary for the data itself.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();

  // Checked as a positive branch so the narrowing below does not depend on
  // `redirect()`'s `never` return type.
  if (current.status === "authenticated") {
    return <AuthenticatedShell user={current.user}>{children}</AuthenticatedShell>;
  }

  const headerList = await headers();
  const requestedPath = headerList.get(PATHNAME_HEADER) ?? DEFAULT_AUTHENTICATED_PATH;

  redirect(buildLoginPath(requestedPath));
}

/** The visible shell, only ever rendered for a verified user. */
function AuthenticatedShell({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              ClientFlow
            </Link>

            <nav aria-label="Main" className="flex items-center gap-4">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}

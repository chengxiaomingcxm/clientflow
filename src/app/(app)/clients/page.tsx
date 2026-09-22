import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthNotice } from "@/components/auth/auth-notice";
import { ClientList } from "@/components/clients/client-list";
import { buttonVariants } from "@/components/ui/button";
import { buildLoginPath } from "@/lib/auth/redirect";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/user";
import { listClients } from "@/lib/clients/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Clients | ClientFlow",
};

/**
 * Client list (Phase 2).
 *
 * A Server Component: the rows are read on the server with the session's
 * credentials, so `public.clients` Row Level Security decides what can be
 * fetched and no client-side data fetching library is involved.
 *
 * The gate below is defence in depth — `(app)/layout.tsx` has already verified
 * the session — and it is also where the owner id comes from: it is never taken
 * from a parameter.
 */
export default async function ClientsPage() {
  const current = await getCurrentUser();

  // Positive branch so the narrowing does not depend on `redirect()` returning
  // `never`.
  if (current.status === "authenticated") {
    return <ClientsView user={current.user} />;
  }

  redirect(buildLoginPath("/clients"));
}

async function ClientsView({ user }: { user: AuthenticatedUser }) {
  const result = await listClients(user.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">The people and companies you work with.</p>
        </div>

        <Link href="/clients/new" className={cn(buttonVariants())}>
          New client
        </Link>
      </header>

      {result.ok ? (
        <ClientList clients={result.clients} />
      ) : (
        <AuthNotice
          title="Clients are unavailable"
          message={result.failure.message}
          variant="destructive"
        />
      )}
    </div>
  );
}

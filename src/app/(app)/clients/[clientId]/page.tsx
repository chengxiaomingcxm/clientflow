import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthNotice } from "@/components/auth/auth-notice";
import { DeleteClientForm } from "@/components/clients/delete-client-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildLoginPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/user";
import { getClientById } from "@/lib/clients/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Client | ClientFlow",
};

/**
 * Client detail page (Phase 2).
 *
 * **Not-found semantics.** A client that does not exist, a client that belongs to
 * another tenant and a malformed id all produce `not_found` in the data access
 * layer, and all three are rendered through `notFound()`. The response therefore
 * carries no information about whether an id exists in somebody else's account.
 */
export default async function ClientDetailPage(props: PageProps<"/clients/[clientId]">) {
  const { clientId } = await props.params;

  const current = await getCurrentUser();

  if (current.status !== "authenticated") {
    redirect(buildLoginPath(`/clients/${clientId}`));
  }

  const result = await getClientById(current.user.id, clientId);

  if (!result.ok) {
    if (result.failure.code === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">Client</h1>
        <AuthNotice
          title="This client is unavailable"
          message={result.failure.message}
          variant="destructive"
        />
      </div>
    );
  }

  const client = result.client;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
          {/* The arrow is decorative: it must not become part of the link's
              accessible name, which the tests and screen readers rely on. */}
          <span aria-hidden="true">←</span> Back to clients
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
            <p className="text-muted-foreground">{client.company ?? "Client"}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/clients/${client.id}/edit`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Edit client
            </Link>

            <DeleteClientForm clientId={client.id} clientName={client.name} />
          </div>
        </header>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Client information</h2>
          </CardTitle>
          <CardDescription>Contact details recorded for this client.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <DetailItem label="Email" value={client.email} />
            <DetailItem label="Phone" value={client.phone} />
            <DetailItem label="Company" value={client.company} />
            <DetailItem
              label="Added"
              value={<time dateTime={client.createdAt}>{formatDate(client.createdAt)}</time>}
            />
            <DetailItem
              label="Last updated"
              value={<time dateTime={client.updatedAt}>{formatDate(client.updatedAt)}</time>}
            />
          </dl>

          <div className="space-y-1">
            <h3 className="text-sm font-medium">Notes</h3>
            {client.notes ? (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{client.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value ?? "Not provided"}</dd>
    </div>
  );
}

/**
 * Renders the calendar date of a timestamp.
 *
 * Deliberately derived from the ISO value rather than from a locale-aware
 * formatter: the server's locale and time zone must not change what is rendered,
 * so the output stays deterministic and matches what the tests assert.
 */
function formatDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

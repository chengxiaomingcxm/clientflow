import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The client list and its empty state.
 *
 * Both are plain presentational components with no data access and no client-side
 * JavaScript, so they render in the Server Component page and can also be
 * exercised directly in unit tests.
 */

/**
 * The columns the list renders.
 *
 * Structurally compatible with the DAL's `Client` (which carries more columns),
 * so the page can pass its rows straight through while this component stays
 * independent of the server-only data access layer.
 */
export type ClientListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

export function ClientList({ clients }: { clients: ClientListItem[] }) {
  if (clients.length === 0) {
    return <EmptyClients />;
  }

  return (
    <ul aria-label="Clients" className="space-y-3">
      {clients.map((client) => (
        <li key={client.id}>
          <ClientRow client={client} />
        </li>
      ))}
    </ul>
  );
}

function ClientRow({ client }: { client: ClientListItem }) {
  // Only the details that were actually given, joined into one line, so a client
  // with no contact information is not rendered as a row of separators.
  const details = [client.company, client.email, client.phone].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return (
    <Card size="sm">
      <CardContent>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Link
            href={`/clients/${client.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {client.name}
          </Link>

          {details.length > 0 ? (
            <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Shown when the signed-in user has no clients yet. */
export function EmptyClients() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>No clients yet</h2>
        </CardTitle>
        <CardDescription>
          Add the people and companies you work with. Projects and tasks can be attached to a client
          later.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Link href="/clients/new" className={cn(buttonVariants())}>
          Add your first client
        </Link>
      </CardContent>
    </Card>
  );
}

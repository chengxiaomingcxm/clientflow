import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthNotice } from "@/components/auth/auth-notice";
import { ClientForm } from "@/components/clients/client-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildLoginPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/user";
import { updateClientAction } from "@/lib/clients/actions";
import { clientFormValuesFromClient } from "@/lib/clients/form-state";
import { getClientById } from "@/lib/clients/queries";

export const metadata: Metadata = {
  title: "Edit client | ClientFlow",
};

/**
 * Edit-client page (Phase 2).
 *
 * The current row is loaded on the server so the form starts from what is
 * actually stored, and the update goes through the same shared schema and the
 * same form component as creation. A client the caller cannot see is rendered as
 * `notFound()`, exactly like a client that does not exist.
 */
export default async function EditClientPage(props: PageProps<"/clients/[clientId]/edit">) {
  const { clientId } = await props.params;

  const current = await getCurrentUser();

  if (current.status !== "authenticated") {
    redirect(buildLoginPath(`/clients/${clientId}/edit`));
  }

  const result = await getClientById(current.user.id, clientId);

  if (!result.ok) {
    if (result.failure.code === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit client</h1>
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
        <Link
          href={`/clients/${client.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {/* Decorative, so it stays out of the link's accessible name. */}
          <span aria-hidden="true">←</span> Back to client
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Edit client</h1>
          <p className="text-muted-foreground">{client.name}</p>
        </header>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Client details</h2>
          </CardTitle>
          <CardDescription>Only the name is required.</CardDescription>
        </CardHeader>

        <CardContent>
          <ClientForm
            action={updateClientAction}
            clientId={client.id}
            initialValues={clientFormValuesFromClient(client)}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            cancelHref={`/clients/${client.id}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

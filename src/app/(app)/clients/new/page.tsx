import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClientForm } from "@/components/clients/client-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildLoginPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/user";
import { createClientAction } from "@/lib/clients/actions";

export const metadata: Metadata = {
  title: "New client | ClientFlow",
};

/**
 * Create-client page (Phase 2).
 *
 * The page only decides whether the visitor is signed in and renders the form;
 * validation, ownership and the write itself happen in `createClientAction` on
 * the server.
 */
export default async function NewClientPage() {
  const current = await getCurrentUser();

  if (current.status === "authenticated") {
    return <NewClientView />;
  }

  redirect(buildLoginPath("/clients/new"));
}

function NewClientView() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">New client</h1>
        <p className="text-muted-foreground">Add a person or a company you work with.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Client details</h2>
          </CardTitle>
          <CardDescription>Only the name is required.</CardDescription>
        </CardHeader>

        <CardContent>
          <ClientForm
            action={createClientAction}
            submitLabel="Create client"
            pendingLabel="Creating…"
            cancelHref="/clients"
          />
        </CardContent>
      </Card>
    </div>
  );
}

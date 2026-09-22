import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Not-found boundary for a client route.
 *
 * Reached through `notFound()` from the detail, edit or delete (via redirect)
 * code path, and used for every reason a row is not available: it was deleted, the
 * id is malformed, or the client belongs to another tenant. The wording therefore
 * says only "could not be found" — it must not confirm or deny that an id exists
 * somewhere else, because that difference is exactly the information tenant
 * isolation protects.
 *
 * It renders inside the protected `(app)` shell, so only a signed-in user ever
 * sees it; an anonymous visitor is redirected to sign in first.
 */
export default function ClientNotFound() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Client not found</h1>
        <p className="text-muted-foreground">
          That client could not be found. It may have been deleted, or the link may be incorrect.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>What now?</h2>
          </CardTitle>
          <CardDescription>Head back to the list to pick a client that does exist.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap items-center gap-3">
          <Link href="/clients" className={cn(buttonVariants())}>
            Back to clients
          </Link>

          <Link href="/clients/new" className={cn(buttonVariants({ variant: "outline" }))}>
            New client
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

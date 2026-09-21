import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Public landing page.
 *
 * It stays unauthenticated on purpose: it is the entry point that offers sign-in
 * and registration. Anything that requires a session lives under the `(app)`
 * route group, which is gated on the server.
 */
const implementedItems = [
  "Email and password accounts with server-verified sessions",
  "Profiles created automatically by a database trigger, not by the browser",
  "Protected routes enforced on the server, never by client-side state",
  "Row Level Security with owner-only policies on every table",
  "Input validation shared by the browser form and the Server Action",
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            ClientFlow V1.0
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">ClientFlow</h1>
          <p className="text-base leading-7 text-muted-foreground">
            A lightweight CRM and project management app for freelancers and small agencies: keep
            your clients, projects and tasks in one place.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/login" className={buttonVariants()}>
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants({ variant: "outline" })}>
              Create account
            </Link>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Phase 1 &mdash; authentication and profiles</h2>
            </CardTitle>
            <CardDescription>
              Client, project and task management arrive in later phases.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ul className="space-y-2">
              {implementedItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    &bull;
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard | ClientFlow",
};

/**
 * Minimal authenticated landing page (Phase 1).
 *
 * It intentionally shows no metrics: revenue, client/project/task counts, recent
 * projects and upcoming deadlines belong to Phase 5. Its only purpose here is to
 * prove that the protected shell works and to give sign-in somewhere to land.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          You are signed in. This is the Phase 1 landing page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Phase 1 &mdash; authentication and profiles</h2>
          </CardTitle>
          <CardDescription>
            Accounts, sessions and protected routes are now in place.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-muted-foreground">
            Client, project and task management arrive in Phases 2&ndash;4, and the dashboard
            metrics in Phase 5. Until then this page deliberately stays empty.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

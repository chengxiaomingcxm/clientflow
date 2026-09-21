import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthNotice } from "@/components/auth/auth-notice";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { firstSearchParam, resolveNextPath, sanitizeNextPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/user";

export const metadata: Metadata = {
  title: "Create account | ClientFlow",
};

/**
 * Registration page (Server Component).
 *
 * Creating the account and the corresponding `profiles` row happens in the
 * Server Action plus a database trigger; nothing is written from the browser.
 */
export default async function RegisterPage(props: PageProps<"/register">) {
  const searchParams = await props.searchParams;
  const requestedNext = sanitizeNextPath(firstSearchParam(searchParams.next));

  const current = await getCurrentUser();

  const configurationMessage =
    current.status === "not_configured" || current.status === "unavailable"
      ? current.failure.message
      : null;
  const configurationIsError = current.status === "unavailable";

  if (current.status === "authenticated") {
    redirect(resolveNextPath(requestedNext));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Create your account</h1>
        </CardTitle>
        <CardDescription>
          Start tracking your clients, projects and tasks in one place.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {configurationMessage ? (
          <AuthNotice
            title="Authentication is not available"
            message={configurationMessage}
            variant={configurationIsError ? "destructive" : "default"}
          />
        ) : null}

        <RegisterForm nextPath={requestedNext ?? ""} />
      </CardContent>
    </Card>
  );
}

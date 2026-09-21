import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthNotice } from "@/components/auth/auth-notice";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeConfirmError } from "@/lib/auth/confirm";
import { firstSearchParam, resolveNextPath, sanitizeNextPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/user";

export const metadata: Metadata = {
  title: "Sign in | ClientFlow",
};

/**
 * Sign-in page (Server Component).
 *
 * The "already signed in?" decision is made here, on the server, so it cannot be
 * bypassed by disabling JavaScript. The submitted `next` value is sanitised
 * before it is used, which is what keeps the login page from becoming an open
 * redirect for authenticated visitors.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const requestedNext = sanitizeNextPath(firstSearchParam(searchParams.next));

  const current = await getCurrentUser();

  const configurationMessage =
    current.status === "not_configured" || current.status === "unavailable"
      ? current.failure.message
      : null;
  const configurationIsError = current.status === "unavailable";
  const confirmMessage = describeConfirmError(firstSearchParam(searchParams.confirm));

  if (current.status === "authenticated") {
    redirect(resolveNextPath(requestedNext));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>Sign in</h1>
        </CardTitle>
        <CardDescription>Use the email address and password you registered with.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {configurationMessage ? (
          <AuthNotice
            title="Authentication is not available"
            message={configurationMessage}
            variant={configurationIsError ? "destructive" : "default"}
          />
        ) : null}

        {confirmMessage ? (
          <AuthNotice title="Confirmation failed" message={confirmMessage} variant="destructive" />
        ) : null}

        <LoginForm nextPath={requestedNext ?? ""} />
      </CardContent>
    </Card>
  );
}

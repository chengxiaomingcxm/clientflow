import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthNotice } from "@/components/auth/auth-notice";
import { ProfileForm } from "@/components/profile/profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildLoginPath } from "@/lib/auth/redirect";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/user";
import { getOwnProfile } from "@/lib/profile/queries";

export const metadata: Metadata = {
  title: "Settings | ClientFlow",
};

/**
 * Phase 1 profile page.
 *
 * Deliberately minimal: it shows the account email and lets the user change their
 * display name. It is not a general settings system — that would belong to a
 * later phase.
 *
 * The gate below is defence in depth: `(app)/layout.tsx` has already verified the
 * session, and `public.profiles` additionally enforces ownership through Row Level
 * Security.
 */
export default async function SettingsPage() {
  const current = await getCurrentUser();

  // Positive branch so the narrowing does not depend on `redirect()` returning
  // `never`.
  if (current.status === "authenticated") {
    return <ProfileSettings user={current.user} />;
  }

  redirect(buildLoginPath("/settings"));
}

async function ProfileSettings({ user }: { user: AuthenticatedUser }) {
  const profileResult = await getOwnProfile(user.id);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your account details.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Profile</h2>
          </CardTitle>
          <CardDescription>
            The email address is managed by Supabase Auth and cannot be changed here.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {profileResult.ok ? (
            <>
              <dl className="space-y-1">
                <dt className="text-sm text-muted-foreground">Email</dt>
                <dd className="text-sm font-medium">{profileResult.profile.email}</dd>
              </dl>

              <ProfileForm initialFullName={profileResult.profile.fullName ?? ""} />
            </>
          ) : (
            <AuthNotice
              title="Profile is unavailable"
              message={profileResult.failure.message}
              variant="destructive"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

/**
 * Sign-out control.
 *
 * Rendered as a POSTing form backed by a Server Action, not a link: a GET link
 * can be triggered by a prefetch, an image tag or a crawler, signing the user out
 * without their intent.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}

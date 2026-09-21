import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Informational block for a page-level message that is not tied to a form
 * submission (missing configuration, unreachable Auth service, failed email
 * confirmation). The text always comes from a fixed allowlist.
 */
export function AuthNotice({
  title,
  message,
  variant = "default",
}: {
  title: string;
  message: string;
  variant?: "default" | "destructive";
}) {
  return (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

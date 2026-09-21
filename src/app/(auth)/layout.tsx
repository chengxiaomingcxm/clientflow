import Link from "next/link";

/**
 * Public shell for the authentication pages.
 *
 * It contains no authorization logic: `/login` and `/register` decide for
 * themselves whether the current visitor may see them (a signed-in user is sent
 * to the application instead).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-8">
        <header className="space-y-2 text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            ClientFlow
          </Link>
          <p className="text-sm text-muted-foreground">
            Lightweight CRM and project management for freelancers and small agencies
          </p>
        </header>

        {children}
      </div>
    </main>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Phase 0 placeholder page.
 *
 * It intentionally contains no business functionality (no clients, projects or
 * tasks): it only proves that the Next.js + Tailwind + shadcn/ui shell renders
 * and gives the Playwright smoke test something stable to assert against.
 */
const foundationItems = [
  "Next.js App Router with TypeScript and Tailwind CSS v4",
  "shadcn/ui primitives and shared class-name helper",
  "Supabase browser and server clients via @supabase/ssr (no auth flows yet)",
  "PostgreSQL schema, composite tenant foreign keys and owner-only Row Level Security",
  "Vitest unit tests, Playwright smoke tests and GitHub Actions CI",
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            ClientFlow V1.0
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            ClientFlow foundation
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            A lightweight CRM and project management app for freelancers and small agencies. Product
            features arrive in later phases; this page only confirms that the Phase 0 setup is
            running.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Phase 0 &mdash; architecture and project setup</h2>
            </CardTitle>
            <CardDescription>No business features are implemented yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {foundationItems.map((item) => (
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

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ClientNotFound from "@/app/(app)/clients/[clientId]/not-found";

/**
 * Not-found boundary suite.
 *
 * `notFound()` is what the detail, edit and delete code paths reach when a client
 * does not exist, when its id is malformed, or when it belongs to another tenant.
 * The boundary therefore has to explain the situation without hinting at which of
 * those happened — that difference is exactly what tenant isolation protects.
 * (The live behaviour is covered by the credential-gated block of
 * `tests/e2e/clients.spec.ts`; this test proves the wording and links.)
 */
describe("ClientNotFound", () => {
  it("says the client could not be found", () => {
    render(<ClientNotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "Client not found" })).toBeVisible();
    expect(screen.getByText(/could not be found/i)).toBeVisible();
  });

  it("offers a way back to the list and to the create form", () => {
    render(<ClientNotFound />);

    expect(screen.getByRole("link", { name: "Back to clients" })).toHaveAttribute(
      "href",
      "/clients",
    );
    expect(screen.getByRole("link", { name: "New client" })).toHaveAttribute(
      "href",
      "/clients/new",
    );
  });

  it("does not reveal whether the client exists for another tenant", () => {
    const { container } = render(<ClientNotFound />);
    const text = container.textContent ?? "";

    // The copy explains the two possibilities a visitor may legitimately know
    // about, and says nothing about ownership or about other accounts.
    expect(text).toMatch(/may have been deleted/i);
    expect(text).not.toMatch(/belongs to another|permission|not authorised|not authorized/i);
    expect(text).not.toMatch(/user_id|policy|row level security/i);
  });
});

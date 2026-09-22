import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClientList, type ClientListItem } from "@/components/clients/client-list";

/**
 * Client list suite.
 *
 * The list is what a signed-in user sees first, so these tests cover the two
 * states the page can be in (rows, and the empty state with its call to action)
 * and confirm that nothing beyond the rendered columns travels into the UI.
 */

const ACME = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Acme Corporation",
  email: "billing@acme.example",
  phone: "+44 20 7946 0000",
  company: "Acme Ltd",
};

const GLOBEX = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Globex",
  email: null,
  phone: null,
  company: null,
};

describe("ClientList", () => {
  it("shows the empty state with a call to action when there are no clients", () => {
    render(<ClientList clients={[]} />);

    expect(screen.getByRole("heading", { level: 2, name: "No clients yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first client" })).toHaveAttribute(
      "href",
      "/clients/new",
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("links every client to its detail page", () => {
    render(<ClientList clients={[ACME, GLOBEX]} />);

    const list = screen.getByRole("list", { name: "Clients" });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(list).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acme Corporation" })).toHaveAttribute(
      "href",
      `/clients/${ACME.id}`,
    );
    expect(screen.getByRole("link", { name: "Globex" })).toHaveAttribute(
      "href",
      `/clients/${GLOBEX.id}`,
    );
  });

  it("summarises the details that were provided", () => {
    render(<ClientList clients={[ACME]} />);

    expect(screen.getByText("Acme Ltd · billing@acme.example · +44 20 7946 0000")).toBeVisible();
  });

  it("renders a client with no contact details without a row of separators", () => {
    render(<ClientList clients={[GLOBEX]} />);

    expect(screen.getByRole("link", { name: "Globex" })).toBeVisible();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("never renders the ownership column", () => {
    const withOwnership = {
      ...ACME,
      user_id: "11111111-1111-4111-8111-111111111111",
    } as unknown as ClientListItem;

    const { container } = render(<ClientList clients={[withOwnership]} />);

    expect(container.textContent).not.toContain("11111111");
  });
});

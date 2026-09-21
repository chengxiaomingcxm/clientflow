import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

/**
 * The Phase 0 landing page is a synchronous Server Component, so it can be
 * rendered directly with React Testing Library.
 */
describe("Phase 0 landing page", () => {
  it("renders the product name as the page heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ClientFlow foundation");
  });

  it("renders the Phase 0 status section", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Phase 0");
    expect(screen.getByText(/no business features are implemented yet/i)).toBeInTheDocument();
  });

  it("lists the foundation items that Phase 0 delivered", () => {
    render(<Home />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(
      screen.getByText(/owner-only Row Level Security/i, { exact: false }),
    ).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

/**
 * Landing page suite.
 *
 * The page is a synchronous Server Component, so it can be rendered directly
 * with React Testing Library. In Phase 1 it stays public: it is the entry point
 * that offers sign-in and registration, and it must not leak protected content.
 */
describe("landing page", () => {
  it("renders the product name as the page heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ClientFlow");
  });

  it("describes the current phase", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Phase 1");
    expect(
      screen.getByText(/client, project and task management arrive in later phases/i),
    ).toBeInTheDocument();
  });

  it("offers a route into authentication", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("lists what Phase 1 delivered", () => {
    render(<Home />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText(/owner-only policies on every table/i)).toBeInTheDocument();
  });
});

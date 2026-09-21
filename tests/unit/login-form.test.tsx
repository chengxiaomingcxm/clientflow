import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInActionMock } = vi.hoisted(() => ({ signInActionMock: vi.fn() }));

vi.mock("@/lib/auth/actions", () => ({ signInAction: signInActionMock }));

import { LoginForm } from "@/components/auth/login-form";
import { errorState, noticeState, INITIAL_AUTH_FORM_STATE } from "@/lib/auth/form-state";

/**
 * Login form accessibility and feedback suite.
 *
 * The Server Action is mocked so the tests describe the component contract:
 * accessible controls, and every piece of state the action can return rendered
 * where a screen reader will find it.
 */

function submitForm() {
  const form = screen.getByRole("button", { name: /sign in/i }).closest("form");

  if (!form) {
    throw new Error("The sign-in button is not inside a form");
  }

  fireEvent.submit(form);
}

beforeEach(() => {
  signInActionMock.mockReset();
  signInActionMock.mockResolvedValue(INITIAL_AUTH_FORM_STATE);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("labels every control so it is reachable by name", () => {
    render(<LoginForm nextPath="" />);

    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("uses autocomplete hints that password managers understand", () => {
    render(<LoginForm nextPath="" />);

    expect(screen.getByLabelText(/email/i)).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autocomplete", "current-password");
  });

  it("carries the return path as a hidden field", () => {
    const { container } = render(<LoginForm nextPath="/settings" />);

    expect(container.querySelector('input[name="next"]')).toHaveValue("/settings");
  });

  it("offers a link to registration", () => {
    render(<LoginForm nextPath="" />);

    expect(screen.getByRole("link", { name: /create one/i })).toHaveAttribute("href", "/register");
  });

  it("renders field errors and marks the input invalid", async () => {
    signInActionMock.mockResolvedValue(
      errorState("Check the highlighted fields and try again.", {
        fieldErrors: { email: ["Enter a valid email address."] },
        values: { email: "nope" },
      }),
    );

    render(<LoginForm nextPath="" />);
    submitForm();

    // Await the committed state update first: the input is remounted when the
    // action returns a value, so a reference captured earlier would be stale.
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();

    const email = screen.getByLabelText(/email/i);

    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "email-error");
    expect(email).toHaveValue("nope");
    expect(screen.getByRole("alert")).toHaveTextContent(/check the highlighted fields/i);
  });

  it("announces a form-level error even when no field is at fault", async () => {
    signInActionMock.mockResolvedValue(
      errorState("Incorrect email or password.", { values: { email: "owner@example.com" } }),
    );

    render(<LoginForm nextPath="" />);
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("shows a notice returned by the action", async () => {
    signInActionMock.mockResolvedValue(noticeState("Confirm your email, then sign in."));

    render(<LoginForm nextPath="" />);
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm your email/i);
  });

  it("renders no alert before anything is submitted", () => {
    render(<LoginForm nextPath="" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

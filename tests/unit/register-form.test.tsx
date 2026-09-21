import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signUpActionMock } = vi.hoisted(() => ({ signUpActionMock: vi.fn() }));

vi.mock("@/lib/auth/actions", () => ({ signUpAction: signUpActionMock }));

import { RegisterForm } from "@/components/auth/register-form";
import { INITIAL_AUTH_FORM_STATE, errorState, noticeState } from "@/lib/auth/form-state";

/**
 * Registration form suite. Mirrors the login form contract, plus the password
 * policy hint that must be announced to assistive technology.
 */

function submitForm() {
  const form = screen.getByRole("button", { name: /create account/i }).closest("form");

  if (!form) {
    throw new Error("The create-account button is not inside a form");
  }

  fireEvent.submit(form);
}

beforeEach(() => {
  signUpActionMock.mockReset();
  signUpActionMock.mockResolvedValue(INITIAL_AUTH_FORM_STATE);
});

describe("RegisterForm", () => {
  it("labels every control, including the optional name", () => {
    render(<RegisterForm nextPath="" />);

    expect(screen.getByLabelText(/name \(optional\)/i)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: /create account/i })).toBeEnabled();
  });

  it("announces the password policy next to the field", () => {
    render(<RegisterForm nextPath="" />);

    const password = screen.getByLabelText(/password/i);

    expect(password).toHaveAttribute("aria-describedby", "password-hint");
    expect(screen.getByText(/at least 8 characters/i)).toHaveAttribute("id", "password-hint");
  });

  it("carries the return path as a hidden field", () => {
    const { container } = render(<RegisterForm nextPath="/settings" />);

    expect(container.querySelector('input[name="next"]')).toHaveValue("/settings");
  });

  it("offers a link to sign in", () => {
    render(<RegisterForm nextPath="" />);

    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("renders a password error and points the field at both messages", async () => {
    signUpActionMock.mockResolvedValue(
      errorState("Check the highlighted fields and try again.", {
        fieldErrors: { password: ["Password must include at least one number."] },
        values: { email: "new@example.com", fullName: "" },
      }),
    );

    render(<RegisterForm nextPath="" />);
    submitForm();

    // Await the committed state update before querying the control.
    expect(await screen.findByText(/must include at least one number/i)).toBeInTheDocument();

    const password = screen.getByLabelText(/password/i);

    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password.getAttribute("aria-describedby")).toBe("password-hint password-error");
  });

  it("shows the 'confirm your email' notice", async () => {
    signUpActionMock.mockResolvedValue(
      noticeState("Account created. Check your inbox for a confirmation link, then sign in."),
    );

    render(<RegisterForm nextPath="" />);
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(/check your inbox/i);
  });

  it("renders a generic failure without leaking details", async () => {
    signUpActionMock.mockResolvedValue(
      errorState("We could not create an account with those details.", {
        values: { email: "taken@example.com", fullName: "" },
      }),
    );

    render(<RegisterForm nextPath="" />);
    submitForm();

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent(/could not create an account/i);
    expect(alert).not.toHaveTextContent(/already registered/i);
  });
});

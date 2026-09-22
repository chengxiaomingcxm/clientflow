import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClientForm } from "@/components/clients/client-form";
import {
  INITIAL_CLIENT_FORM_STATE,
  errorState,
  type ClientFormState,
} from "@/lib/clients/form-state";

/**
 * Client form suite.
 *
 * The same component serves create and edit, so the tests exercise both: the
 * fields are labelled and accessible, the edit form carries the row id as a
 * hidden selector (and only as a selector), and a failure from the Server Action
 * is displayed without losing what the user typed.
 */

const CLIENT_ID = "33333333-3333-4333-8333-333333333333";

const actionMock = vi.fn<(state: ClientFormState, data: FormData) => Promise<ClientFormState>>();

function renderCreateForm() {
  return render(
    <ClientForm
      action={actionMock}
      submitLabel="Create client"
      pendingLabel="Creating…"
      cancelHref="/clients"
    />,
  );
}

function submitForm() {
  const form = screen.getByRole("button", { name: /create client/i }).closest("form");

  if (!form) {
    throw new Error("The submit button is not inside a form");
  }

  fireEvent.submit(form);
}

beforeEach(() => {
  actionMock.mockReset();
  actionMock.mockResolvedValue(INITIAL_CLIENT_FORM_STATE);
});

describe("ClientForm", () => {
  it("labels every control", () => {
    renderCreateForm();

    expect(screen.getByLabelText("Client name")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Company")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Phone")).toHaveAttribute("type", "tel");
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
  });

  it("requires the client name and nothing else", () => {
    renderCreateForm();

    expect(screen.getByLabelText("Client name")).toBeRequired();
    expect(screen.getByLabelText("Email")).not.toBeRequired();
    expect(screen.getByLabelText("Company")).not.toBeRequired();
    expect(screen.getByLabelText("Phone")).not.toBeRequired();
    expect(screen.getByLabelText("Notes")).not.toBeRequired();
  });

  it("explains the notes limit without hiding it behind an error", () => {
    renderCreateForm();

    const notes = screen.getByLabelText("Notes");

    expect(notes).toHaveAttribute("aria-describedby", "notes-hint");
    expect(screen.getByText(/up to 2000 characters/i)).toHaveAttribute("id", "notes-hint");
  });

  it("offers a way out without saving", () => {
    renderCreateForm();

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/clients");
  });

  it("sends no ownership field, whatever the page rendered", () => {
    const { container } = renderCreateForm();

    expect(container.querySelector('input[name="user_id"]')).toBeNull();
    expect(container.querySelector('input[name="owner_id"]')).toBeNull();
    expect(container.querySelector('input[name="clientId"]')).toBeNull();
  });

  it("carries the row id as a hidden selector when editing", () => {
    const { container } = render(
      <ClientForm
        action={actionMock}
        clientId={CLIENT_ID}
        initialValues={{
          name: "Acme Corporation",
          email: "billing@acme.example",
          phone: "",
          company: "Acme Ltd",
          notes: "",
        }}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        cancelHref={`/clients/${CLIENT_ID}`}
      />,
    );

    expect(container.querySelector('input[name="clientId"]')).toHaveValue(CLIENT_ID);
    expect(screen.getByLabelText("Client name")).toHaveValue("Acme Corporation");
    expect(screen.getByLabelText("Email")).toHaveValue("billing@acme.example");
    expect(screen.getByLabelText("Phone")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("shows a field error and points the control at it", async () => {
    actionMock.mockResolvedValue(
      errorState("Check the highlighted fields and try again.", {
        fieldErrors: { name: ["Client name must be at least 1 character."] },
      }),
    );

    renderCreateForm();
    submitForm();

    expect(await screen.findByText(/must be at least 1 character/i)).toBeInTheDocument();

    const name = screen.getByLabelText("Client name");

    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "name-error");
  });

  it("shows a form-level failure as an alert", async () => {
    actionMock.mockResolvedValue(errorState("That client could not be found."));

    renderCreateForm();
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("That client could not be found.");
  });

  it("keeps the submitted values so nothing has to be retyped", async () => {
    actionMock.mockResolvedValue(
      errorState("Those details were not accepted. Check the entries and try again.", {
        values: {
          name: "Globex",
          email: "",
          phone: "",
          company: "Globex BV",
          notes: "Called on Monday",
        },
      }),
    );

    renderCreateForm();

    fireEvent.change(screen.getByLabelText("Client name"), { target: { value: "Globex" } });
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Globex BV" } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByLabelText("Client name")).toHaveValue("Globex");
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Notes")).toHaveValue("Called on Monday");
    });

    expect(screen.getByLabelText("Company")).toHaveValue("Globex BV");
  });
});

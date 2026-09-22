import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteClientActionMock } = vi.hoisted(() => ({ deleteClientActionMock: vi.fn() }));

vi.mock("@/lib/clients/actions", () => ({ deleteClientAction: deleteClientActionMock }));

import { DeleteClientForm } from "@/components/clients/delete-client-form";
import { INITIAL_CLIENT_FORM_STATE, errorState } from "@/lib/clients/form-state";

/**
 * Delete-confirmation suite.
 *
 * The point of this component is that deleting takes two deliberate clicks and
 * that the confirmation names what is about to disappear. The security of the
 * delete itself is asserted in the Server Action and database suites; what is
 * checked here is that the destructive submit button does not exist before the
 * user has confirmed.
 */

const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_NAME = "Acme Corporation";

function renderForm() {
  return render(<DeleteClientForm clientId={CLIENT_ID} clientName={CLIENT_NAME} />);
}

beforeEach(() => {
  deleteClientActionMock.mockReset();
  deleteClientActionMock.mockResolvedValue(INITIAL_CLIENT_FORM_STATE);
});

describe("DeleteClientForm", () => {
  it("offers no way to submit a delete before confirming", () => {
    const { container } = renderForm();

    expect(screen.getByRole("button", { name: "Delete client" })).toHaveAttribute("type", "button");
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
  });

  it("carries the id in a hidden field rather than in the URL", () => {
    const { container } = renderForm();

    expect(container.querySelector('input[name="clientId"]')).toHaveValue(CLIENT_ID);
  });

  it("asks for confirmation and names the client", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Delete client" }));

    expect(screen.getByText(/cannot be undone/i)).toBeVisible();
    expect(screen.getByText(CLIENT_NAME)).toBeVisible();
    expect(screen.getByRole("button", { name: `Yes, delete ${CLIENT_NAME}` })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("can be backed out of", () => {
    const { container } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Delete client" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(0);
  });

  it("submits the delete once confirmed", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Delete client" }));

    const confirmation = screen.getByRole("button", { name: `Yes, delete ${CLIENT_NAME}` });
    const form = confirmation.closest("form");

    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(deleteClientActionMock).toHaveBeenCalledTimes(1);
  });

  it("shows a failure from the server instead of pretending it worked", async () => {
    deleteClientActionMock.mockResolvedValue(errorState("That client could not be found."));

    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Delete client" }));

    const form = screen.getByRole("button", { name: `Yes, delete ${CLIENT_NAME}` }).closest("form");

    fireEvent.submit(form as HTMLFormElement);

    const alert = await screen.findByRole("alert");

    expect(within(alert).getByText("That client could not be found.")).toBeVisible();
    expect(alert).not.toHaveTextContent(/permission|policy|denied/i);
  });
});

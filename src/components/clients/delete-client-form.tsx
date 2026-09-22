"use client";

import { useActionState, useState } from "react";

import { FormAlert } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { deleteClientAction } from "@/lib/clients/actions";
import { INITIAL_CLIENT_FORM_STATE } from "@/lib/clients/form-state";

/**
 * Delete control with an explicit confirmation step.
 *
 * Confirming is a user-interface safeguard, not a security control: the delete
 * itself is authorized entirely on the server (verified session plus the
 * caller's `user_id` in the statement, and Row Level Security in the database).
 * This component only ensures somebody cannot lose a client with a single
 * accidental click.
 *
 * A destructive action is a POSTing form backed by a Server Action rather than a
 * link, so a prefetch, an image tag or a crawler cannot trigger it.
 */
export function DeleteClientForm({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteClientAction,
    INITIAL_CLIENT_FORM_STATE,
  );
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />

      <FormAlert state={state} />

      {isConfirming ? (
        <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
          <p className="text-sm">
            Delete <span className="font-medium">{clientName}</span>? This removes the client and
            cannot be undone.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Deleting…" : `Yes, delete ${clientName}`}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="destructive" onClick={() => setIsConfirming(true)}>
          Delete client
        </Button>
      )}
    </form>
  );
}

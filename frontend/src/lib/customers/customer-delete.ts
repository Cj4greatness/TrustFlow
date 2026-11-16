// What to do after a failed delete. Pure, so it can be tested without a
// browser.

import { isApiError } from "../../api/errors";

export type DeleteOutcome =
  { kind: "gone" } | { kind: "error"; message: string };

/**
 * A customer that is already gone counts as deleted, so the person is not
 * left on a page for a record that no longer exists.
 */
export function describeDeleteError(error: unknown): DeleteOutcome {
  if (!isApiError(error)) {
    return {
      kind: "error",
      message: "Something unexpected happened. Please try again.",
    };
  }
  if (error.kind === "not_found") return { kind: "gone" };
  if (error.kind === "forbidden") {
    return {
      kind: "error",
      message: "You do not have permission to delete customers.",
    };
  }
  if (error.kind === "network") {
    return {
      kind: "error",
      message: `${error.message} Check the customers list before trying again.`,
    };
  }
  return { kind: "error", message: error.message };
}

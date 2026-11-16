import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors";
import { describeDeleteError } from "./customer-delete";

describe("describeDeleteError", () => {
  it("treats a customer that is already gone as deleted", () => {
    expect(
      describeDeleteError(new ApiError({ kind: "not_found", status: 404 })),
    ).toEqual({ kind: "gone" });
  });

  it("explains a missing permission", () => {
    const outcome = describeDeleteError(
      new ApiError({ kind: "forbidden", status: 403 }),
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error")
      expect(outcome.message).toContain("permission");
  });

  it("tells the person to check the list after a network failure", () => {
    const outcome = describeDeleteError(
      new ApiError({ kind: "network", status: null }),
    );
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") {
      expect(outcome.message).toContain("Check the customers list");
    }
  });

  it("uses the server message for other API errors", () => {
    expect(
      describeDeleteError(
        new ApiError({ kind: "server", status: 500, messages: ["Try later"] }),
      ),
    ).toEqual({ kind: "error", message: "Try later" });
  });

  it("handles anything that is not an API error", () => {
    expect(describeDeleteError(new Error("boom"))).toEqual({
      kind: "error",
      message: "Something unexpected happened. Please try again.",
    });
  });
});

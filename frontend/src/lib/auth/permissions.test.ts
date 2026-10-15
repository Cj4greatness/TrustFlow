import { describe, expect, it } from "vitest";
import {
  can,
  isRole,
  PERMISSION_MATRIX,
  ROLES,
  type Permission,
  type Role,
} from "./permissions";

const rolesWith = (p: Permission): Role[] => ROLES.filter((r) => can(r, p));

describe("can()", () => {
  it("denies unknown, empty, and missing roles", () => {
    expect(can(undefined, "customer:read")).toBe(false);
    expect(can(null, "customer:read")).toBe(false);
    expect(can("superuser", "customer:read")).toBe(false);
    expect(isRole("OWNER")).toBe(false);
  });

  it("customer update is Manager and above", () => {
    expect(rolesWith("customer:update")).toEqual(["owner", "admin", "manager"]);
  });

  it("inventory adjust is Staff and above, never Viewer", () => {
    expect(rolesWith("inventory:adjust")).toEqual([
      "owner",
      "admin",
      "manager",
      "staff",
    ]);
  });

  it("invoice read is universal", () => {
    expect(rolesWith("invoice:read")).toEqual([...ROLES]);
  });

  it("every role can view members, so users can discover their own role", () => {
    expect(rolesWith("member:view")).toEqual([...ROLES]);
  });

  it("member invite and update are Owner and Admin only", () => {
    expect(rolesWith("member:invite")).toEqual(["owner", "admin"]);
    expect(rolesWith("member:update")).toEqual(["owner", "admin"]);
  });

  it("supplier read is Owner only (stopgap), delete is Owner and Admin", () => {
    expect(rolesWith("supplier:read")).toEqual(["owner"]);
    expect(rolesWith("supplier:delete")).toEqual(["owner", "admin"]);
  });

  it("receipt regenerate is Owner only in the current backend matrix", () => {
    // The hand-off brief says Owner and Admin. The backend code grants it to
    // Owner only. Raised with the backend owner; update when resolved.
    expect(rolesWith("receipt:regenerate")).toEqual(["owner"]);
  });

  it("staff cannot create payments or update invoices", () => {
    expect(can("staff", "payment:create")).toBe(false);
    expect(can("staff", "invoice:update")).toBe(false);
    expect(can("manager", "payment:create")).toBe(true);
  });

  it("system-only permissions are granted to no role", () => {
    expect(rolesWith("receipt:create")).toEqual([]);
    expect(rolesWith("delivery:create")).toEqual([]);
  });

  it("viewer holds read and view permissions only", () => {
    const viewer = PERMISSION_MATRIX.viewer;
    expect(
      viewer.every((p) => p.endsWith(":read") || p.endsWith(":view")),
    ).toBe(true);
  });
});

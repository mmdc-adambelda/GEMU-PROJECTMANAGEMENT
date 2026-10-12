import { describe, expect, it } from "vitest";
import { assignableRoles, atLeast, canManageMember, isOrgAdmin } from "@/lib/permissions";
import { safeNext } from "@/lib/utils/safe-redirect";

describe("permissions (UI mirror)", () => {
  it("orders roles", () => {
    expect(atLeast("owner", "admin")).toBe(true);
    expect(atLeast("member", "admin")).toBe(false);
    expect(atLeast(null, "guest")).toBe(false);
    expect(isOrgAdmin("guest")).toBe(false);
  });

  it("limits which roles can be granted", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).toEqual(["member", "guest"]);
    expect(assignableRoles("member")).toEqual([]);
    expect(assignableRoles("guest")).toEqual([]);
  });

  it("protects owners and self", () => {
    expect(canManageMember("admin", "owner", false)).toBe(false);
    expect(canManageMember("owner", "owner", false)).toBe(true);
    expect(canManageMember("owner", "member", true)).toBe(false);
    expect(canManageMember("member", "guest", false)).toBe(false);
  });
});

describe("safeNext", () => {
  it("allows only same-site relative paths", () => {
    expect(safeNext("/o/acme?x=1")).toBe("/o/acme?x=1");
    expect(safeNext("https://evil.test")).toBe("/");
    expect(safeNext("//evil.test")).toBe("/");
    expect(safeNext("/\\evil.test")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext(null, "/home")).toBe("/home");
  });
});

import { describe, expect, it } from "vitest";
import { emailDomain, isEmailDomainAllowed, parseAllowedEmailDomains } from "../../src/auth/domains.js";

describe("auth domain helpers", () => {
  it("parses comma-separated domains case-insensitively", () => {
    expect(parseAllowedEmailDomains(" Example.COM,school.edu, example.com ,, @partner.org ")).toEqual([
      "example.com",
      "school.edu",
      "partner.org"
    ]);
  });

  it("extracts valid email domains", () => {
    expect(emailDomain("User@Example.COM")).toBe("example.com");
    expect(emailDomain("missing-at")).toBeUndefined();
    expect(emailDomain("@example.com")).toBeUndefined();
  });

  it("requires exact domain matches", () => {
    const allowed = parseAllowedEmailDomains("company.com");
    expect(isEmailDomainAllowed("teacher@company.com", allowed)).toBe(true);
    expect(isEmailDomainAllowed("teacher@sub.company.com", allowed)).toBe(false);
    expect(isEmailDomainAllowed("teacher@gmail.com", allowed)).toBe(false);
  });
});

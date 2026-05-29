import { describe, expect, it } from "vitest";
import { __testing, assertNavigationAllowed, type NavigationGuardSettings } from "../src/shared-browser/ssrf.js";

const { isPrivateOrReservedIp, hostMatchesSuffix, normalizeHost } = __testing;

function guard(overrides: Partial<NavigationGuardSettings> = {}): NavigationGuardSettings {
  return {
    allowlistEnabled: false,
    allowlist: [],
    blockedHostSuffixes: [],
    allowInsecureLocal: false,
    ...overrides
  };
}

describe("isPrivateOrReservedIp", () => {
  it("flags private and reserved IPv4 ranges", () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.4.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    for (const ip of ["1.1.1.1", "1.0.0.1", "8.8.8.8", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(false);
    }
  });

  it("flags loopback, link-local, and unique-local IPv6", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6 and IPv4-mapped public addresses", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateOrReservedIp("::ffff:1.1.1.1")).toBe(false);
  });
});

describe("hostMatchesSuffix / normalizeHost", () => {
  it("strips a leading www. and lowercases", () => {
    expect(normalizeHost("www.Example.COM")).toBe("example.com");
    expect(normalizeHost("Example.COM")).toBe("example.com");
  });

  it("matches exact host and dot-bounded subdomains only", () => {
    expect(hostMatchesSuffix("example.com", "example.com")).toBe(true);
    expect(hostMatchesSuffix("docs.example.com", "example.com")).toBe(true);
    expect(hostMatchesSuffix("notexample.com", "example.com")).toBe(false);
    expect(hostMatchesSuffix("example.com", "")).toBe(false);
  });
});

describe("assertNavigationAllowed", () => {
  it("rejects non-https schemes", async () => {
    await expect(assertNavigationAllowed("http://1.1.1.1/", guard())).rejects.toThrow(/only https/);
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "ftp://1.1.1.1/"]) {
      await expect(assertNavigationAllowed(url, guard())).rejects.toThrow(/navigation_blocked/);
    }
  });

  it("rejects literal private/reserved IPs", async () => {
    for (const ip of ["127.0.0.1", "169.254.169.254", "10.0.0.5", "192.168.0.1"]) {
      await expect(assertNavigationAllowed(`https://${ip}/`, guard()), ip).rejects.toThrow(/private or reserved/);
    }
  });

  it("rejects localhost", async () => {
    await expect(assertNavigationAllowed("https://localhost/", guard())).rejects.toThrow(/localhost/);
    await expect(assertNavigationAllowed("https://app.localhost/", guard())).rejects.toThrow(/localhost/);
  });

  it("allows a public literal IP", async () => {
    const url = await assertNavigationAllowed("https://1.1.1.1/path", guard());
    expect(url.hostname).toBe("1.1.1.1");
  });

  it("enforces the allowlist when enabled", async () => {
    await expect(
      assertNavigationAllowed("https://1.1.1.1/", guard({ allowlistEnabled: true, allowlist: ["example.com"] }))
    ).rejects.toThrow(/not on the room allowlist/);
  });

  it("blocks hosts matching a blocked suffix", async () => {
    await expect(
      assertNavigationAllowed("https://1.1.1.1/", guard({ blockedHostSuffixes: ["1.1.1.1"] }))
    ).rejects.toThrow(/blocked by policy/);
  });

  it("allows http and loopback when allowInsecureLocal is set", async () => {
    const url = await assertNavigationAllowed("http://127.0.0.1:3000/", guard({ allowInsecureLocal: true }));
    expect(url.protocol).toBe("http:");
  });
});

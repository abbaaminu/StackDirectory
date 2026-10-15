import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard shared by every endpoint that fetches a caller-supplied URL.
 *
 * `/api/website-metadata` and `/api/favicon` both turn a visitor's input into an
 * outbound request from inside the deployment's network, so both need the same
 * "is this host actually a public website?" answer. It used to live inside
 * `website-metadata.ts`; a second copy here would have been the obvious place
 * for one of the two to drift and leave a hole.
 */

/** True when `address` is a routable public IP (v4 or v6). */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    return !(
      first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith("::ffff:")
    );
  }
  return false;
}

/** One resolved address for a hostname, as `node:dns` reports it. */
export type HostAddress = { address: string };

/** Resolves a hostname to every address it points at. */
export type HostResolver = (hostname: string) => Promise<HostAddress[]>;

const dnsHostResolver: HostResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Active resolver. Indirect so the check suite can exercise this module without
 * depending on live DNS (and therefore on the network being reachable when
 * `npm run verify` runs).
 */
let resolveHost: HostResolver = dnsHostResolver;

/** Test hook: swap the resolver, or pass `null` to restore real DNS. */
export function setHostResolver(resolver: HostResolver | null): void {
  resolveHost = resolver ?? dnsHostResolver;
}

/**
 * Parses `value` and proves the host resolves to a public address, or throws.
 *
 * Every hop of a redirect chain must pass through this: a site can answer
 * `/favicon.ico` with a 302 pointing at `http://169.254.169.254/latest/meta-data`
 * or at an internal service, which is exactly the request an attacker cannot
 * make directly.
 */
export async function resolvePublicUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public HTTP or HTTPS websites can be inspected.");
  }
  if (url.username || url.password) {
    throw new Error("Website URLs cannot contain credentials.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Enter a publicly accessible website URL.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The website host must resolve to a public IP address.");
  }
  return url;
}

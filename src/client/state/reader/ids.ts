import type { AccountId } from "./schema.ts";

/** Browser-local identities, including HTTP LAN/WireGuard hosts. getRandomValues
 * works there; randomUUID is restricted to secure contexts such as HTTPS/localhost.
 * Existing identities remain untouched. These tokens are not authentication keys.
 */
export function mintLocalId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function mintAccountId(): AccountId {
  return `account:${mintLocalId()}`;
}

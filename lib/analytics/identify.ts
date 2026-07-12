// lib/analytics/identify.ts
import { createHash } from "node:crypto";

export { PII_DENYLIST, sanitizeProps } from "./sanitize";

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

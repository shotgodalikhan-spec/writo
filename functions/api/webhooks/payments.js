// Payment webhook placeholder for Dodo Payments (merchant of record).
// DISABLED until PAYMENTS_ENABLED = "true" and DODO_WEBHOOK_SECRET are set in Cloudflare.
//
// TODO before enabling (after opening an IP in Kazakhstan and passing Dodo KYC):
// 1. In the Dodo dashboard create a webhook pointing to https://<site>/api/webhooks/payments
// 2. Put its signing secret into Cloudflare secret DODO_WEBHOOK_SECRET.
// 3. Dodo follows the Standard Webhooks spec (headers webhook-id, webhook-timestamp,
//    webhook-signature). Verify the signature as described in Dodo's docs before trusting
//    the body. Check the current docs: the format may change.
// 4. Map events to the user by email:
//    subscription active/renewed  -> UPDATE users SET plan='unlimited', plan_status='active'
//    subscription cancelled/failed -> UPDATE users SET plan='free', plan_status='cancelled'
// 5. Make a test payment in Dodo test mode before switching to live keys.
import { json } from "../../../lib/core.js";

export async function onRequestPost({ env }) {
  if (env.PAYMENTS_ENABLED !== "true" || !env.DODO_WEBHOOK_SECRET) {
    return json({ error: "Payments are not enabled yet." }, 503);
  }
  // Intentionally not implemented: signature verification must be added first (see TODO above).
  return json({ error: "Webhook handler not implemented yet." }, 501);
}

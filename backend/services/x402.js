// backend/services/x402.js
// Helpers around x402-based autopay/charges using Privy x402 server API.

const { x402Authorizations } = require("../store/memoryStore");

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_API_KEY = process.env.PRIVY_API_KEY;
const PRIVY_X402_BASE = process.env.PRIVY_X402_BASE || "https://auth.privy.io/api/v1";

async function getFetch() {
  if (typeof fetch !== "undefined") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

async function postJson(url, body) {
  const f = await getFetch();
  const res = await f(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PRIVY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Privy x402 non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const reason = json?.error || json?.message || `status_${res.status}`;
    const err = new Error(`Privy x402 error: ${reason}`);
    err.details = json;
    throw err;
  }
  return json;
}

/**
 * Charge a member's share using their stored x402 authorization.
 * Falls back to stub success if API keys are missing.
 * @returns {Promise<{ ok: boolean, txRef?: string, reason?: string }>}
 */
async function chargeMemberShareWithX402({ groupId, memberId, amount, token }) {
  const key = `${groupId}:${memberId}`;
  const auth = x402Authorizations[key];

  if (!auth) {
    return { ok: false, reason: "not_authorized" };
  }

  if (auth.status !== "approved") {
    return { ok: false, reason: "not_approved" };
  }

  // If Privy creds are missing, simulate success to keep demo flows working.
  if (!PRIVY_APP_ID || !PRIVY_API_KEY) {
    const txRef = `x402-sim-${Date.now()}-${memberId}`;
    return { ok: true, txRef, simulated: true };
  }

  try {
    const payload = {
      app_id: PRIVY_APP_ID,
      authorization_id: auth.authorizationId,
      amount: {
        value: amount,
        currency: token || auth.token || "USDC",
      },
      reference: `rent-${groupId}-${memberId}-${Date.now()}`,
      metadata: {
        groupId,
        memberId,
      },
    };

    const json = await postJson(`${PRIVY_X402_BASE}/x402/charges`, payload);
    const txRef = json?.id || json?.txRef || json?.reference || payload.reference;
    return { ok: true, txRef };
  } catch (err) {
    console.error("Privy x402 charge error", err);
    return { ok: false, reason: err?.message || "charge_failed" };
  }
}

module.exports = {
  chargeMemberShareWithX402,
};

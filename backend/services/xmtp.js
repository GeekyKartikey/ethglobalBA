// backend/services/xmtp.js
// XMTP helper to broadcast group updates from the RentSplit system wallet.

const { xmtpGroups, xmtpInvites, xmtpLogs } = require("../store/memoryStore");

let clientPromise = null;

async function getXmtpClient() {
  if (!process.env.XMTP_PRIVATE_KEY) {
    throw new Error("XMTP_PRIVATE_KEY is not set");
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      // XMTP JS + ethers are ESM, so use dynamic import to stay compatible with CJS
      const [{ Client }, { Wallet }] = await Promise.all([
        import("@xmtp/xmtp-js"),
        import("ethers"),
      ]);
      const wallet = new Wallet(process.env.XMTP_PRIVATE_KEY);
      const env = process.env.XMTP_ENV || "production";
      const client = await Client.create(wallet, { env });
      return client;
    })();
  }

  return clientPromise;
}

function uniqueLower(addresses = []) {
  return [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
}

function appendLog(groupId, entry) {
  if (!xmtpLogs[groupId]) xmtpLogs[groupId] = [];
  xmtpLogs[groupId].unshift(entry);
  // keep last 200 entries to avoid unbounded growth
  if (xmtpLogs[groupId].length > 200) {
    xmtpLogs[groupId] = xmtpLogs[groupId].slice(0, 200);
  }
}

async function filterReachable(client, addresses) {
  const reachable = [];
  const unreachable = [];

  for (const addr of addresses) {
    try {
      const canMsg = await client.canMessage(addr);
      if (canMsg) {
        reachable.push(addr);
      } else {
        unreachable.push(addr);
      }
    } catch (err) {
      console.warn("XMTP reachability check failed", err?.message || err);
      unreachable.push(addr);
    }
  }

  return { reachable, unreachable };
}

function buildContext(groupId, groupName) {
  return {
    conversationId: `rentsplit-${groupId}`,
    metadata: {
      groupId,
      groupName,
      app: "RentSplit",
    },
  };
}

async function ensureGroupConversation(groupId, groupName) {
  const client = await getXmtpClient();
  const context = buildContext(groupId, groupName);
  // no-op creation: conversation is created when first message is sent.
  xmtpGroups[groupId] = {
    conversationId: context.conversationId,
    members: xmtpGroups[groupId]?.members || [],
    lastSentAt: xmtpGroups[groupId]?.lastSentAt || null,
    title: groupName,
    lastMessage: xmtpGroups[groupId]?.lastMessage || null,
    lastFailed: xmtpGroups[groupId]?.lastFailed || [],
    lastUnreachable: xmtpGroups[groupId]?.lastUnreachable || [],
  };
  return { client, conversationId: context.conversationId, context };
}

/**
 * Broadcast a text update to all provided member wallet addresses.
 * This uses a shared V2 conversationId so the thread is grouped in clients.
 */
async function broadcastGroupUpdate({
  groupId,
  groupName,
  memberWallets,
  text,
  meta = {},
}) {
  const addresses = uniqueLower(memberWallets);
  if (!addresses.length) {
    appendLog(groupId, {
      id: meta.id || `log-${groupId}-${Date.now()}`,
      type: meta.type || "notice",
      text: text || "No recipients to notify",
      payload: meta.payload || { reason: "no_addresses" },
      actor: meta.actor || null,
      createdAt: new Date().toISOString(),
    });
    return {
      sentTo: [],
      skipped: [{ reason: "no_addresses" }],
      unreachable: [],
      conversationId: null,
    };
  }

  try {
    const { client, context } = await ensureGroupConversation(groupId, groupName);

    const { reachable, unreachable } = await filterReachable(client, addresses);
    const sentTo = [];
    const failed = [];

    if (reachable.length) {
      for (const addr of reachable) {
        try {
          const convo = await client.conversations.newConversation(addr, context);
          await convo.send(text);
          sentTo.push(addr);
        } catch (err) {
          failed.push({ address: addr, error: err?.message || "send_failed" });
          console.error("XMTP send error", err);
        }
      }
    }

    xmtpGroups[groupId] = {
      conversationId: context.conversationId,
      members: sentTo,
      lastSentAt: sentTo.length ? new Date().toISOString() : xmtpGroups[groupId]?.lastSentAt || null,
      title: groupName,
      lastMessage: text,
      lastFailed: failed,
      lastUnreachable: unreachable,
    };

    appendLog(groupId, {
      id: meta.id || `log-${groupId}-${Date.now()}`,
      type: meta.type || "notice",
      text,
      payload: meta.payload || null,
      actor: meta.actor || null,
      createdAt: new Date().toISOString(),
    });

    return {
      conversationId: context.conversationId,
      sentTo,
      failed,
      unreachable,
    };
  } catch (err) {
    console.warn("XMTP disabled or failed", err?.message || err);
    appendLog(groupId, {
      id: meta.id || `log-${groupId}-${Date.now()}`,
      type: meta.type || "notice",
      text: text || "XMTP send failed",
      payload: { error: err?.message || "xmtp_unavailable" },
      actor: meta.actor || null,
      createdAt: new Date().toISOString(),
    });
    return {
      conversationId: null,
      sentTo: [],
      failed: [{ reason: err?.message || "xmtp_unavailable" }],
      unreachable: [],
    };
  }
}

async function sendInvite(groupId, groupName, walletAddress, code) {
  try {
    const { client, context } = await ensureGroupConversation(groupId, groupName);
    const canMsg = await client.canMessage(walletAddress);
    if (!canMsg) {
      return { ok: false, reason: "wallet_unreachable" };
    }
    const convo = await client.conversations.newConversation(walletAddress, context);
    await convo.send(
      `You have been invited to join rent group "${groupName}". Invite code: ${code}. Accept in-app to join.`
    );
    return { ok: true };
  } catch (err) {
    console.error("XMTP invite send error", err);
    return { ok: false, reason: err?.message || "invite_failed" };
  }
}

async function announceJoin(groupId, groupName, label) {
  await broadcastGroupUpdate({
    groupId,
    groupName,
    memberWallets: xmtpGroups[groupId]?.members || [],
    text: `👤 ${label} has joined the rent group.`,
  });
}

module.exports = {
  broadcastGroupUpdate,
  ensureGroupConversation,
  sendInvite,
  announceJoin,
};

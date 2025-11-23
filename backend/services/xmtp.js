// backend/services/xmtp.js
// XMTP helper to broadcast group updates from the RentSplit system wallet.

const { xmtpGroups } = require("../store/memoryStore");

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

/**
 * Broadcast a text update to all provided member wallet addresses.
 * This uses a shared V2 conversationId so the thread is grouped in clients.
 */
async function broadcastGroupUpdate({
  groupId,
  groupName,
  memberWallets,
  text,
}) {
  const addresses = uniqueLower(memberWallets);
  if (!addresses.length) {
    return {
      sentTo: [],
      skipped: [{ reason: "no_addresses" }],
      unreachable: [],
      conversationId: null,
    };
  }

  try {
    const client = await getXmtpClient();
    const context = buildContext(groupId, groupName);

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

    return {
      conversationId: context.conversationId,
      sentTo,
      failed,
      unreachable,
    };
  } catch (err) {
    console.warn("XMTP disabled or failed", err?.message || err);
    return {
      conversationId: null,
      sentTo: [],
      failed: [{ reason: err?.message || "xmtp_unavailable" }],
      unreachable: [],
    };
  }
}

module.exports = {
  broadcastGroupUpdate,
};

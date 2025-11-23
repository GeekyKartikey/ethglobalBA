// backend/routes/groups.js

const express = require("express");
const router = express.Router();
const {
  users,
  groups,
  groupMembers,
  x402Authorizations,
  settlements,
  xmtpGroups,
} = require("../store/memoryStore");
const { broadcastGroupUpdate } = require("../services/xmtp");

function getGroupMemberIds(groupId) {
  return Array.from(groupMembers[groupId] || []);
}

function userIsInGroup(groupId, userId) {
  if (!userId) return false;
  return (groupMembers[groupId] || new Set()).has(userId);
}

function collectMemberWallets(groupId) {
  const memberIds = getGroupMemberIds(groupId);
  const group = groups[groupId];
  return memberIds
    .map((uid) => users[uid]?.walletAddress || null)
    .concat(group?.collectorAddress || null);
}

// placeholder persistence hook; replace with DB/file logging if needed
async function persistEvent(evt) {
  console.log("Persist event", evt);
}

// Filecoin stub (no-op for now)
async function uploadToFilecoin(json) {
  console.log("Uploading to Filecoin (stub):", json);
  return `bafy-mock-${Date.now()}`;
}

// GET /groups?userId=...
router.get("/", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId query is required" });

  const list = Object.values(groups).filter((g) =>
    (groupMembers[g.id] || new Set()).has(userId)
  );

  res.json(list);
});

// POST /groups
router.post("/", (req, res) => {
  const { userId, name, totalRent, token, collectorAddress } = req.body;

  if (!userId || !name || !totalRent || !token || !collectorAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const groupId = `g_${Date.now()}`;

  groups[groupId] = {
    id: groupId,
    name,
    totalRent: Number(totalRent),
    token,
    collectorAddress,
    createdBy: userId,
    createdAt: new Date().toISOString(),
  };

  groupMembers[groupId] = new Set([userId]);

  // Kick off XMTP group thread (best-effort, won't fail the request)
  const creatorWallet = users[userId]?.walletAddress || null;
  const memberWallets = [creatorWallet, collectorAddress].filter(Boolean);
  broadcastGroupUpdate({
    groupId,
    groupName: name,
    memberWallets,
    text: `📣 New RentSplit group "${name}" created. Total rent: ${totalRent} ${token}. Collector: ${collectorAddress}.`,
  }).catch((err) => console.warn("XMTP create group failed", err));

  res.json({ groupId });
});

// GET /groups/:groupId/summary?userId=...
router.get("/:groupId/summary", (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.query;

  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const memberIds = getGroupMemberIds(groupId);

  const members = memberIds.map((uid) => {
    const user = users[uid];
    const key = `${groupId}:${uid}`;
    const hasAutopay = !!x402Authorizations[key];

    return {
      userId: uid,
      email: user?.email || null,
      walletAddress: user?.walletAddress || null,
      hasAutopay,
    };
  });

  const yourShare =
    userId && memberIds.length > 0
      ? group.totalRent / memberIds.length
      : null;

  res.json({
    group,
    members,
    yourShare,
    xmtp: xmtpGroups[groupId] || null,
  });
});

// GET /groups/:groupId/x402/status?userId=...
router.get("/:groupId/x402/status", (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const key = `${groupId}:${userId}`;
  const auth = x402Authorizations[key];

  if (!auth) {
    return res.json({ status: "not_authorized" });
  }

  res.json({
    status: auth.status,
    limit: auth.limit,
    token: auth.token,
  });
});

// POST /groups/:groupId/x402/initiate
router.post("/:groupId/x402/initiate", (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "userId is required" });

  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const key = `${groupId}:${userId}`;

  x402Authorizations[key] = {
    status: "approved", // later: wait for webhook
    authorizationId: `auth_${Date.now()}`,
    limit: group.totalRent,
    token: group.token,
    createdAt: new Date().toISOString(),
  };

  const fakeUrl = "https://demo-x402-auth-page.example.com/approve";
  res.json({ x402Url: fakeUrl });
});

// POST /groups/:groupId/settle-now
router.post("/:groupId/settle-now", async (req, res) => {
  const { groupId } = req.params;
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const memberIds = getGroupMemberIds(groupId);
  if (memberIds.length === 0) {
    return res.status(400).json({ error: "No members in group" });
  }

  const share = group.totalRent / memberIds.length;

  const payments = memberIds.map((uid) => {
    const user = users[uid];
    const key = `${groupId}:${uid}`;
    const hasAutopay = !!x402Authorizations[key];

    return {
      from: user?.walletAddress || null,
      amount: share,
      method: hasAutopay ? "x402" : "manual",
      txRef: `tx_${Date.now()}_${uid}`,
    };
  });

  const settlementJson = {
    groupId,
    total: group.totalRent,
    token: group.token,
    collectorAddress: group.collectorAddress,
    payments,
    createdAt: new Date().toISOString(),
  };

  const cid = await uploadToFilecoin(settlementJson);

  if (!settlements[groupId]) settlements[groupId] = [];
  settlements[groupId].push({
    id: `s_${Date.now()}`,
    cid,
    createdAt: new Date().toISOString(),
  });

  persistEvent({
    id: `settle-${groupId}-${Date.now()}`,
    groupId,
    type: "settlement",
    payload: { settlementJson, cid },
    createdAt: new Date().toISOString(),
  }).catch(() => {});

  // Notify group via XMTP (best-effort)
  const walletList = collectMemberWallets(groupId);
  const statusLine = payments
    .map(
      (p) =>
        `${p.from ? p.from.slice(0, 6) : "unknown"}: ${p.amount} ${group.token} (${p.method})`
    )
    .join("; ");
  broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets: walletList,
    text: `✅ Settlement created for "${group.name}": total ${group.totalRent} ${group.token}. Breakdown: ${statusLine}. Filecoin CID: ${cid}`,
  }).catch((err) => console.warn("XMTP settlement notify failed", err));

  // later: XMTP send message here

  res.json({ settlementCid: cid });
});

// POST /groups/:groupId/xmtp/reminder
router.post("/:groupId/xmtp/reminder", async (req, res) => {
  const { groupId } = req.params;
  const { dueDate, note } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const memberIds = getGroupMemberIds(groupId);
  const memberWallets = collectMemberWallets(groupId);

  const when = dueDate ? `by ${dueDate}` : "soon";
  const message = `⏰ Rent reminder for "${group.name}": ${group.totalRent} ${group.token} is due ${when}. ${
    note ? note : ""
  }`;

  const result = await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text: message,
  });

  persistEvent({
    id: `reminder-${groupId}-${Date.now()}`,
    groupId,
    type: "reminder",
    payload: { dueDate, note, total: group.totalRent, token: group.token },
    createdAt: new Date().toISOString(),
  }).catch(() => {});

  res.json({ ok: true, xmtp: xmtpGroups[groupId] || null, delivery: result });
});

// POST /groups/:groupId/xmtp/payment-update
router.post("/:groupId/xmtp/payment-update", async (req, res) => {
  const { groupId } = req.params;
  const { userId, status, amount, token } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const memberIds = getGroupMemberIds(groupId);
  const memberWallets = collectMemberWallets(groupId);

  const user = userId ? users[userId] : null;
  const label = user?.email || user?.walletAddress || userId || "A member";
  const statusText = status || "updated their payment status";
  const amountText = amount
    ? `${amount} ${token || group.token || "USDC"}`
    : "an update";

  const result = await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text: `💬 ${label} ${statusText}: ${amountText} for "${group.name}".`,
  });

  persistEvent({
    id: `payment-${groupId}-${Date.now()}`,
    groupId,
    type: "payment_update",
    payload: { userId, status, amount, token, label },
    createdAt: new Date().toISOString(),
  }).catch(() => {});

  res.json({ ok: true, xmtp: xmtpGroups[groupId] || null, delivery: result });
});

// GET /groups/:groupId/xmtp
router.get("/:groupId/xmtp", (req, res) => {
  const { groupId } = req.params;
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  res.json({
    groupId,
    conversationId: xmtpGroups[groupId]?.conversationId || null,
    lastSentAt: xmtpGroups[groupId]?.lastSentAt || null,
    members: xmtpGroups[groupId]?.members || [],
    lastMessage: xmtpGroups[groupId]?.lastMessage || null,
    lastFailed: xmtpGroups[groupId]?.lastFailed || [],
    lastUnreachable: xmtpGroups[groupId]?.lastUnreachable || [],
  });
});

// POST /groups/:groupId/xmtp/custom - send a freeform XMTP message to group wallets
router.post("/:groupId/xmtp/custom", async (req, res) => {
  const { groupId } = req.params;
  const { userId, text } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Message text is required" });
  }
  if (userId && !userIsInGroup(groupId, userId)) {
    return res.status(403).json({ error: "User is not a member of this group" });
  }

  const memberWallets = collectMemberWallets(groupId);

  const result = await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text: text.trim(),
  });

  persistEvent({
    id: `custom-xmtp-${groupId}-${Date.now()}`,
    groupId,
    type: "xmtp_custom",
    payload: { userId, text },
    createdAt: new Date().toISOString(),
  }).catch(() => {});

  res.json({ ok: true, xmtp: xmtpGroups[groupId] || null, delivery: result });
});

module.exports = router;

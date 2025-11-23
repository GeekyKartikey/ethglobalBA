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
  xmtpInvites,
  paymentRetries,
  xmtpLogs,
} = require("../store/memoryStore");
const {
  broadcastGroupUpdate,
  ensureGroupConversation,
  sendInvite,
  announceJoin,
} = require("../services/xmtp");
const { chargeMemberShareWithX402 } = require("../services/x402");
const { uploadToFilecoinStub } = require("../services/storageStub");

function getGroupMemberIds(groupId) {
  return Array.from(groupMembers[groupId] || []);
}

function userIsInGroup(groupId, userId) {
  if (!userId) return false;
  return (groupMembers[groupId] || new Set()).has(userId);
}

function userIsOwner(groupId, userId) {
  return !!userId && groups[groupId]?.createdBy === userId;
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

function formatPeriodLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function displayNameOrWallet(user) {
  if (!user) return "unknown";
  if (user.email) return user.email;
  if (user.walletAddress) return `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
  return user.id || "member";
}

function appendLog(groupId, entry) {
  if (!xmtpLogs[groupId]) xmtpLogs[groupId] = [];
  xmtpLogs[groupId].unshift({
    id: entry.id || `log-${groupId}-${Date.now()}`,
    createdAt: entry.createdAt || new Date().toISOString(),
    type: entry.type || "notice",
    text: entry.text || "",
    actor: entry.actor || null,
    payload: entry.payload || null,
  });
  if (xmtpLogs[groupId].length > 200) {
    xmtpLogs[groupId] = xmtpLogs[groupId].slice(0, 200);
  }
}

function findUserByWallet(walletAddress) {
  const lower = walletAddress?.toLowerCase();
  if (!lower) return null;
  return Object.values(users).find(
    (u) => u.walletAddress && u.walletAddress.toLowerCase() === lower
  );
}

async function sendGroupMessage(groupId, text, meta = {}) {
  const group = groups[groupId];
  if (!group) return;
  const memberWallets = collectMemberWallets(groupId);
  await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text,
    meta,
  });
}

function scheduleRetry(groupId, userId, reason) {
  const key = `${groupId}:${userId}`;
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  paymentRetries[key] = {
    nextRun: nextRun.toISOString(),
    attempts: (paymentRetries[key]?.attempts || 0) + 1,
    lastReason: reason,
  };
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
router.post("/", async (req, res) => {
  const { userId, name, totalRent, token, collectorAddress, rentDueDay } = req.body;

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
    rentDueDay: rentDueDay || 1,
    xmtpConversationId: null,
  };

  groupMembers[groupId] = new Set([userId]);

  // Kick off XMTP group thread (best-effort, won't fail the request)
  const creatorWallet = users[userId]?.walletAddress || null;
  const memberWallets = [creatorWallet, collectorAddress].filter(Boolean);
  try {
    const { context } = await ensureGroupConversation(groupId, name);
    groups[groupId].xmtpConversationId = context.conversationId;
    await broadcastGroupUpdate({
      groupId,
      groupName: name,
      memberWallets,
      text: `New rent group "${name}" created. Total rent: ${totalRent} ${token}. Collector: ${collectorAddress}.`,
      meta: { type: "group_created" },
    });
    appendLog(groupId, {
      type: "group_created",
      text: `Group "${name}" created. Total rent: ${totalRent} ${token}. Collector: ${collectorAddress}.`,
      actor: users[userId]?.walletAddress || users[userId]?.email || userId,
    });
  } catch (err) {
    console.warn("XMTP create group failed", err);
    appendLog(groupId, {
      type: "group_created",
      text: `Group "${name}" created (XMTP failed: ${err?.message || "unknown"})`,
      actor: users[userId]?.walletAddress || users[userId]?.email || userId,
    });
  }


  res.json({ groupId });
});

// POST /groups/:groupId/members/add-wallet
router.post("/:groupId/members/add-wallet", async (req, res) => {
  const { groupId } = req.params;
  const { walletAddress } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (!walletAddress) return res.status(400).json({ error: "walletAddress is required" });

  let user = findUserByWallet(walletAddress);
  if (!user) {
    // create lightweight user record
    const userId = `wallet_${walletAddress.toLowerCase()}`;
    user = {
      id: userId,
      privyUserId: null,
      walletAddress,
      email: null,
      createdAt: new Date().toISOString(),
    };
    users[userId] = user;
  }

  if (!groupMembers[groupId]) groupMembers[groupId] = new Set();
  groupMembers[groupId].add(user.id);

  await ensureGroupConversation(groupId, group.name);
  await sendGroupMessage(groupId, `👤 ${displayNameOrWallet(user)} has joined the rent group.`, {
    type: "member_joined",
    actor: user.walletAddress || user.email || user.id,
  });
  appendLog(groupId, {
    type: "member_joined",
    text: `${displayNameOrWallet(user)} joined the group.`,
    actor: user.walletAddress || user.email || user.id,
  });

  res.json({ ok: true, userId: user.id });
});

// POST /groups/:groupId/xmtp/invite - invite by wallet to join via XMTP
router.post("/:groupId/xmtp/invite", async (req, res) => {
  const { groupId } = req.params;
  const { walletAddress } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (!walletAddress) return res.status(400).json({ error: "walletAddress is required" });

  const code = `xmtp_${Date.now()}`;
  xmtpInvites[code] = {
    code,
    groupId,
    walletAddress,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const inviteResult = await sendInvite(groupId, group.name, walletAddress, code);
  if (!inviteResult.ok) {
    return res.status(400).json({ error: inviteResult.reason || "invite_failed" });
  }

  res.json({ ok: true, code });
});

// POST /groups/xmtp/invite/:code/accept
router.post("/xmtp/invite/:code/accept", async (req, res) => {
  const { code } = req.params;
  const invite = xmtpInvites[code];
  const { walletAddress } = req.body || {};
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.status === "accepted") {
    return res.json({ ok: true, message: "Already accepted" });
  }

  const group = groups[invite.groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  let user = findUserByWallet(walletAddress || invite.walletAddress);
  const chosenWallet = walletAddress || invite.walletAddress;
  if (!chosenWallet) return res.status(400).json({ error: "walletAddress required" });

  if (!user) {
    const userId = `wallet_${chosenWallet.toLowerCase()}`;
    user = {
      id: userId,
      privyUserId: null,
      walletAddress: chosenWallet,
      email: null,
      createdAt: new Date().toISOString(),
    };
    users[userId] = user;
  }

  if (!groupMembers[group.id]) groupMembers[group.id] = new Set();
  groupMembers[group.id].add(user.id);

  invite.status = "accepted";
  invite.acceptedAt = new Date().toISOString();

  await ensureGroupConversation(group.id, group.name);
  await sendGroupMessage(group.id, `👤 ${displayNameOrWallet(user)} has joined the rent group.`, {
    type: "member_joined",
    actor: user.walletAddress || user.email || user.id,
  });
  appendLog(group.id, {
    type: "member_joined",
    text: `${displayNameOrWallet(user)} joined the group (invite).`,
    actor: user.walletAddress || user.email || user.id,
  });

  res.json({ ok: true, userId: user.id });
});

// POST /groups/:groupId/leave
router.post("/:groupId/leave", (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId is required" });
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (!userIsInGroup(groupId, userId)) {
    return res.status(403).json({ error: "User is not a member of this group" });
  }

  groupMembers[groupId]?.delete(userId);
  delete x402Authorizations[`${groupId}:${userId}`];

  const actor = users[userId];
  sendGroupMessage(
    groupId,
    `${displayNameOrWallet(actor)} left the group.`,
    { type: "member_left", actor: actor?.walletAddress || actor?.email || userId }
  ).catch(() => {});
  appendLog(groupId, {
    type: "member_left",
    text: `${displayNameOrWallet(actor)} left the group.`,
    actor: actor?.walletAddress || actor?.email || userId,
  });

  res.json({ ok: true });
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

// PATCH /groups/:groupId/rent-due-day
router.patch("/:groupId/rent-due-day", (req, res) => {
  const { groupId } = req.params;
  const { userId, rentDueDay } = req.body || {};

  if (!userId) return res.status(400).json({ error: "userId is required" });
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (!userIsOwner(groupId, userId)) {
    return res.status(403).json({ error: "Only the group owner can change the rent due day" });
  }
  if (!userIsInGroup(groupId, userId)) {
    return res.status(403).json({ error: "User is not a member of this group" });
  }

  const day = Number(rentDueDay);
  if (Number.isNaN(day) || day < 1 || day > 28) {
    return res.status(400).json({ error: "rentDueDay must be between 1 and 28" });
  }

  group.rentDueDay = day;
  res.json({ ok: true, rentDueDay: day });
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
    status: "pending", // set to approved after Privy callback/webhook
    authorizationId: `auth_${Date.now()}`,
    limit: group.totalRent,
    token: group.token,
    createdAt: new Date().toISOString(),
  };

  const approveUrl =
    process.env.PRIVY_X402_APPROVAL_URL ||
    "https://auth.privy.io/apps/x402-authorize"; // replace with real Privy approval link
  res.json({ x402Url: approveUrl, authorizationId: x402Authorizations[key].authorizationId });
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

  const payments = [];
  const periodLabel = formatPeriodLabel();

  for (const uid of memberIds) {
    const user = users[uid];
    const result = await chargeMemberShareWithX402({
      groupId,
      memberId: uid,
      amount: share,
      token: group.token,
    });

    if (result.ok) {
      payments.push({
        from: user?.walletAddress || null,
        amount: share,
        method: "x402",
        txRef: result.txRef,
        status: "paid",
      });
      await sendGroupMessage(
        groupId,
        `🟢 Rent paid by ${displayNameOrWallet(user)} for ${periodLabel}. (txRef: ${result.txRef})`
      );
    } else {
      payments.push({
        from: user?.walletAddress || null,
        amount: share,
        method: "x402",
        txRef: null,
        status: "failed",
        reason: result.reason || "charge_failed",
      });
      await sendGroupMessage(
        groupId,
        `🔴 Rent payment failed for ${displayNameOrWallet(user)} for ${periodLabel}. Will retry tomorrow.`
      );
      scheduleRetry(groupId, uid, result.reason || "charge_failed");
    }
  }

  const settlementJson = {
    groupId,
    total: group.totalRent,
    token: group.token,
    collectorAddress: group.collectorAddress,
    payments,
    createdAt: new Date().toISOString(),
  };

  const cid = await uploadToFilecoinStub(settlementJson);

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
  const { dueDate, note, userId } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (userId && !userIsOwner(groupId, userId)) {
    return res.status(403).json({ error: "Only the group owner can send reminders" });
  }

  const memberIds = getGroupMemberIds(groupId);
  const memberWallets = collectMemberWallets(groupId);

  const when = dueDate ? `by ${dueDate}` : "soon";
  const message = `Rent reminder for "${group.name}": ${group.totalRent} ${group.token} is due ${when}. ${note ? note : ""}`;

  const result = await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text: message,
    meta: { type: "rent_reminder", payload: { dueDate, note } },
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
  if (userId && !userIsOwner(groupId, userId)) {
    return res.status(403).json({ error: "Only the group owner can send payment updates" });
  }

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
    text: `${label} ${statusText}: ${amountText} for "${group.name}".`,
    meta: { type: "payment_update_group", payload: { userId, status, amount, token, label } },
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
    conversationId: xmtpGroups[groupId]?.conversationId || groups[groupId]?.xmtpConversationId || null,
    lastSentAt: xmtpGroups[groupId]?.lastSentAt || null,
    members: xmtpGroups[groupId]?.members || [],
    lastMessage: xmtpGroups[groupId]?.lastMessage || null,
    lastFailed: xmtpGroups[groupId]?.lastFailed || [],
    lastUnreachable: xmtpGroups[groupId]?.lastUnreachable || [],
  });
});

// POST /groups/:groupId/xmtp/custom - owner announcement only
router.post("/:groupId/xmtp/custom", async (req, res) => {
  const { groupId } = req.params;
  const { userId, text } = req.body || {};
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Message text is required" });
  }
  if (!userId || !userIsOwner(groupId, userId)) {
    return res.status(403).json({ error: "Only the group owner can send announcements" });
  }

  const memberWallets = collectMemberWallets(groupId);

  const result = await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text: text.trim(),
    meta: { type: "announcement", actor: users[userId]?.walletAddress || users[userId]?.email || userId },
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

// GET /groups/:groupId/xmtp/log?userId=...
router.get("/:groupId/xmtp/log", (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.query;
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });
  if (userId && !userIsInGroup(groupId, userId)) {
    return res.status(403).json({ error: "User is not a member of this group" });
  }
  res.json({
    groupId,
    messages: xmtpLogs[groupId] || [],
    conversationId: xmtpGroups[groupId]?.conversationId || groups[groupId]?.xmtpConversationId || null,
  });
});

module.exports = router;

// backend/services/scheduler.js
// Simple daily scheduler for reminders, due-day settlements, and retries.

const {
  users,
  groups,
  groupMembers,
  x402Authorizations,
  settlements,
  paymentRetries,
} = require("../store/memoryStore");
const { broadcastGroupUpdate } = require("./xmtp");
const { chargeMemberShareWithX402 } = require("./x402");
const { uploadToFilecoinStub } = require("./storageStub");

function getMemberIds(groupId) {
  return Array.from(groupMembers[groupId] || []);
}

function collectMemberWallets(groupId) {
  const group = groups[groupId];
  const memberIds = getMemberIds(groupId);
  return memberIds
    .map((uid) => users[uid]?.walletAddress || null)
    .concat(group?.collectorAddress || null);
}

function displayNameOrWallet(user) {
  if (!user) return "unknown";
  if (user.email) return user.email;
  if (user.walletAddress) return `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
  return user.id || "member";
}

async function sendGroupMessage(groupId, text) {
  const group = groups[groupId];
  if (!group) return;
  const memberWallets = collectMemberWallets(groupId);
  await broadcastGroupUpdate({
    groupId,
    groupName: group.name,
    memberWallets,
    text,
  });
}

function formatPeriodLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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

async function attemptCharge(groupId, userId, share, token, periodLabel) {
  const user = users[userId];
  const hasAuth = !!x402Authorizations[`${groupId}:${userId}`];
  if (!hasAuth) {
    return { status: "failed", reason: "not_authorized" };
  }
  const result = await chargeMemberShareWithX402({
    groupId,
    memberId: userId,
    amount: share,
    token,
  });
  if (result.ok) {
    await sendGroupMessage(
      groupId,
      `🟢 Rent paid by ${displayNameOrWallet(user)} for ${periodLabel}. (txRef: ${result.txRef})`
    );
    return { status: "paid", txRef: result.txRef };
  }
  await sendGroupMessage(
    groupId,
    `🔴 Rent payment failed for ${displayNameOrWallet(user)} for ${periodLabel}. Will retry tomorrow.`
  );
  scheduleRetry(groupId, userId, result.reason || "charge_failed");
  return { status: "failed", reason: result.reason || "charge_failed" };
}

async function runSettlement(groupId, date = new Date()) {
  const group = groups[groupId];
  if (!group) return;

  const memberIds = getMemberIds(groupId);
  if (!memberIds.length) return;

  const share = group.totalRent / memberIds.length;
  const periodLabel = formatPeriodLabel(date);

  await sendGroupMessage(
    groupId,
    `⚪ Running automatic rent settlement for ${periodLabel}...`
  );

  const payments = [];
  for (const uid of memberIds) {
    const result = await attemptCharge(groupId, uid, share, group.token, periodLabel);
    payments.push({
      from: users[uid]?.walletAddress || null,
      amount: share,
      method: "x402",
      txRef: result.txRef || null,
      status: result.status,
      reason: result.reason,
    });
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

  await sendGroupMessage(
    groupId,
    `📄 Settlement for ${periodLabel} completed. Proof: ${cid}`
  );
}

async function runRetries(date = new Date()) {
  const now = date.toISOString();
  for (const [key, retry] of Object.entries(paymentRetries)) {
    if (!retry.nextRun || retry.nextRun > now) continue;
    const [groupId, userId] = key.split(":");
    const group = groups[groupId];
    if (!group) continue;
    const memberIds = getMemberIds(groupId);
    const share = group.totalRent / (memberIds.length || 1);
    const periodLabel = formatPeriodLabel(date);

    const result = await attemptCharge(groupId, userId, share, group.token, periodLabel);
    if (result.status === "paid") {
      delete paymentRetries[key];
    } else {
      scheduleRetry(groupId, userId, result.reason || "charge_failed");
    }
  }
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function runDaily(date = new Date()) {
  await runRetries(date);

  for (const group of Object.values(groups)) {
    const dueDay = group.rentDueDay || 1;
    const dueDate = new Date(date.getFullYear(), date.getMonth(), dueDay);
    const reminderDate = new Date(dueDate);
    reminderDate.setDate(reminderDate.getDate() - 3);

    if (isSameDay(date, reminderDate)) {
      await sendGroupMessage(
        group.id,
        `🟡 Rent is due in 3 days for ${formatPeriodLabel(
          dueDate
        )}. Please make sure your wallet has enough balance.`
      );
    }

    if (isSameDay(date, dueDate)) {
      await runSettlement(group.id, date);
    }
  }
}

function startDailyScheduler() {
  // Run once on startup
  runDaily().catch((err) => console.error("Daily job error", err));
  // Then every 24h
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    runDaily().catch((err) => console.error("Daily job error", err));
  }, DAY_MS);
}

module.exports = {
  startDailyScheduler,
  runDaily,
};

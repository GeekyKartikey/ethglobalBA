// backend/routes/groups.js

const express = require("express");
const router = express.Router();
const {
  users,
  groups,
  groupMembers,
  x402Authorizations,
  settlements,
} = require("../store/memoryStore");

// Filecoin stub (real integration later)
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

  res.json({ groupId });
});

// GET /groups/:groupId/summary?userId=...
router.get("/:groupId/summary", (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.query;

  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const memberIds = Array.from(groupMembers[groupId] || []);

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

  res.json({ group, members, yourShare });
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

  const memberIds = Array.from(groupMembers[groupId] || []);
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

  // later: XMTP send message here

  res.json({ settlementCid: cid });
});

module.exports = router;

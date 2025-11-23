// backend/routes/invites.js

const express = require("express");
const router = express.Router();
const {
  groups,
  invites,
  groupMembers,
  users,
  x402Authorizations,
} = require("../store/memoryStore");

function buildMemberSummaries(groupId) {
  const memberIds = Array.from(groupMembers[groupId] || []);
  return memberIds.map((uid) => {
    const user = users[uid];
    const hasAutopay = !!x402Authorizations[`${groupId}:${uid}`];
    return {
      userId: uid,
      email: user?.email || null,
      walletAddress: user?.walletAddress || null,
      hasAutopay,
    };
  });
}

// POST /invites
router.post("/", (req, res) => {
  const { groupId, userId, walletAddress } = req.body || {};
  if (!groupId || !userId) {
    return res.status(400).json({ error: "groupId and userId are required" });
  }
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: "Group not found" });

  const members = groupMembers[groupId] || new Set();
  if (!members.has(userId)) {
    return res.status(403).json({ error: "Not a member of this group" });
  }

  const code = `inv_${Math.random().toString(36).slice(2, 8)}`;
  invites[code] = {
    code,
    groupId,
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: userId,
    walletAddress: walletAddress || null,
  };

  res.json({ code, walletAddress: walletAddress || null });
});

// GET /invites/:code
router.get("/:code", (req, res) => {
  const invite = invites[req.params.code];
  if (!invite) return res.status(404).json({ error: "Invite not found" });

  const group = groups[invite.groupId];
  const members = group ? buildMemberSummaries(invite.groupId) : [];

  res.json({
    groupId: invite.groupId,
    groupName: group?.name || "Unknown group",
    totalRent: group?.totalRent || null,
    token: group?.token || null,
    collectorAddress: group?.collectorAddress || null,
    rentDueDay: group?.rentDueDay || null,
    status: invite.status,
    walletAddress: invite.walletAddress || null,
    memberCount: members.length,
    members,
  });
});

// POST /invites/:code/accept
router.post("/:code/accept", (req, res) => {
  const { userId } = req.body;
  const invite = invites[req.params.code];

  if (!invite || invite.status !== "pending") {
    return res.status(400).json({ error: "Invalid invite" });
  }

  invite.status = "accepted";
  invite.acceptedByUserId = userId;

  if (!groupMembers[invite.groupId]) {
    groupMembers[invite.groupId] = new Set();
  }
  groupMembers[invite.groupId].add(userId);

  res.json({ groupId: invite.groupId });
});

module.exports = router;

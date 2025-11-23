// backend/routes/invites.js

const express = require("express");
const router = express.Router();
const { groups, invites, groupMembers } = require("../store/memoryStore");

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

  res.json({
    groupName: group?.name || "Unknown group",
    status: invite.status,
    walletAddress: invite.walletAddress || null,
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

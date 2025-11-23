// backend/routes/invites.js

const express = require("express");
const router = express.Router();
const { groups, invites, groupMembers } = require("../store/memoryStore");

// GET /invites/:code
router.get("/:code", (req, res) => {
  const invite = invites[req.params.code];
  if (!invite) return res.status(404).json({ error: "Invite not found" });

  const group = groups[invite.groupId];

  res.json({
    groupName: group?.name || "Unknown group",
    status: invite.status,
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

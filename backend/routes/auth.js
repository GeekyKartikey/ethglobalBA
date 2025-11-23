// backend/routes/auth.js

const express = require("express");
const router = express.Router();
const { users } = require("../store/memoryStore");

// POST /auth/privy-login
router.post("/privy-login", (req, res) => {
  const { privyUserId, email, walletAddress, name } = req.body;

  if (!privyUserId) {
    return res.status(400).json({ error: "privyUserId is required" });
  }

  if (!users[privyUserId]) {
    users[privyUserId] = {
      id: privyUserId,
      privyUserId,
      name: name || null,
      email: email || null,
      walletAddress: walletAddress || null,
      createdAt: new Date().toISOString(),
    };
  } else {
    users[privyUserId].name = name || users[privyUserId].name || null;
    users[privyUserId].email = email || users[privyUserId].email;
    users[privyUserId].walletAddress =
      walletAddress || users[privyUserId].walletAddress;
  }

  res.json(users[privyUserId]);
});

// POST /auth/profile -> update name
router.post("/profile", (req, res) => {
  const { userId, name } = req.body;
  if (!userId || !name) {
    return res.status(400).json({ error: "userId and name are required" });
  }
  const user = users[userId];
  if (!user) return res.status(404).json({ error: "User not found" });

  user.name = name;
  res.json(user);
});

module.exports = router;

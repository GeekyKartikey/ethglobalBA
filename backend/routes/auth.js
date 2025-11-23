// backend/routes/auth.js

const express = require("express");
const router = express.Router();
const { users } = require("../store/memoryStore");

// POST /auth/privy-login
router.post("/privy-login", (req, res) => {
  const { privyUserId, email, walletAddress } = req.body;

  if (!privyUserId) {
    return res.status(400).json({ error: "privyUserId is required" });
  }

  if (!users[privyUserId]) {
    users[privyUserId] = {
      id: privyUserId,
      privyUserId,
      email: email || null,
      walletAddress: walletAddress || null,
      createdAt: new Date().toISOString(),
    };
  } else {
    users[privyUserId].email = email || users[privyUserId].email;
    users[privyUserId].walletAddress =
      walletAddress || users[privyUserId].walletAddress;
  }

  res.json(users[privyUserId]);
});

module.exports = router;

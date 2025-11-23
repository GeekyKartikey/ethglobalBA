// backend/routes/wallets.js

const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

const DEFAULT_RPC = process.env.RPC_URL || "https://rpc.ankr.com/eth";
const DEFAULT_CHAIN = process.env.RPC_CHAIN || "ethereum";
const DEFAULT_TOKEN_SYMBOL = process.env.RPC_TOKEN || "ETH";

// GET /wallets/:address/balance
router.get("/:address/balance", async (req, res) => {
  const { address } = req.params;
  const chain = req.query.chain || DEFAULT_CHAIN;

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(DEFAULT_RPC);
    const balance = await provider.getBalance(address);
    const formatted = ethers.formatEther(balance);
    res.json({
      address,
      chain,
      token: DEFAULT_TOKEN_SYMBOL,
      balance: formatted,
    });
  } catch (err) {
    console.error("Balance lookup error", err);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

module.exports = router;

// backend/routes/wallets.js

const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

const DEFAULT_RPC = process.env.RPC_URL || "https://rpc.ankr.com/eth";
const DEFAULT_CHAIN = process.env.RPC_CHAIN || "ethereum";
const DEFAULT_TOKEN_SYMBOL = process.env.RPC_TOKEN || "ETH";

const CHAIN_CONFIGS = {
  ethereum: { chainId: 1, name: "mainnet", symbol: "ETH" },
  polygon: { chainId: 137, name: "polygon", symbol: "MATIC" },
  optimism: { chainId: 10, name: "optimism", symbol: "ETH" },
  arbitrum: { chainId: 42161, name: "arbitrum", symbol: "ETH" },
  base: { chainId: 8453, name: "base", symbol: "ETH" },
};

// GET /wallets/:address/balance
router.get("/:address/balance", async (req, res) => {
  const { address } = req.params;
  const chain = req.query.chain || DEFAULT_CHAIN;

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    const cfg = CHAIN_CONFIGS[chain] || CHAIN_CONFIGS[DEFAULT_CHAIN];
    const provider = new ethers.JsonRpcProvider(DEFAULT_RPC, {
      name: cfg.name,
      chainId: cfg.chainId,
    });
    const balance = await provider.getBalance(address);
    const formatted = ethers.formatEther(balance);
    res.json({
      address,
      chain,
      token: cfg.symbol || DEFAULT_TOKEN_SYMBOL,
      balance: formatted,
    });
  } catch (err) {
    console.error("Balance lookup error", err);
    res
      .status(500)
      .json({
        error: "Failed to fetch balance",
        detail: err?.message || "provider_error",
      });
  }
});

module.exports = router;

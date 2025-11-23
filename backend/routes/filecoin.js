// backend/routes/filecoin.js

const express = require("express");
const router = express.Router();
const { filecoinRecords } = require("../store/memoryStore");

router.get("/status", (req, res) => {
  const hasConfig =
    !!process.env.FILECOIN_PRIVATE_KEY && !!process.env.FILECOIN_RPC_URL;

  res.json({
    enabled: hasConfig,
    network: process.env.FILECOIN_NETWORK || "mainnet",
    records: filecoinRecords,
  });
});

module.exports = router;

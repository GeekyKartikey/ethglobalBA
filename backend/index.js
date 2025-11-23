// backend/index.js

const express = require("express");
const cors = require("cors");
require("dotenv").config();

// import routes
const authRoutes = require("./routes/auth");
const groupRoutes = require("./routes/groups");
const inviteRoutes = require("./routes/invites");
const walletRoutes = require("./routes/wallets");
const filecoinRoutes = require("./routes/filecoin");

const app = express();

// middlewares
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  })
);
app.use(express.json());

// health
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// mount routes
app.use("/auth", authRoutes); // /auth/privy-login
app.use("/groups", groupRoutes); // /groups, /groups/:id/summary etc.
app.use("/invites", inviteRoutes); // /invites/:code
app.use("/wallets", walletRoutes); // /wallets/:address/balance
app.use("/filecoin", filecoinRoutes); // /filecoin/status

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend API listening on port ${PORT}`);
});

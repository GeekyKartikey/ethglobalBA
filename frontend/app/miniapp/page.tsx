"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets, useFundWallet } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

function formatAddress(addr: string | null | undefined) {
  if (!addr) return "Not set";
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (err) {
    const preview = text.slice(0, 200);
    throw new Error(
      `Expected JSON but got status ${res.status} ${res.statusText}: ${preview}`
    );
  }
}

type Group = {
  id: string;
  name: string;
  totalRent: number;
  token: string;
  collectorAddress: string;
};

type GroupMember = {
  userId: string;
  email: string | null;
  walletAddress: string | null;
  hasAutopay: boolean;
};

type GroupXmtp = {
  conversationId: string | null;
  members: string[];
  lastSentAt: string | null;
  lastMessage?: string | null;
  lastFailed?: { address?: string; error?: string; reason?: string }[];
  lastUnreachable?: string[];
};

type XmtpDelivery = {
  conversationId: string | null;
  sentTo: string[];
  failed?: { address?: string; error?: string; reason?: string }[];
  unreachable?: string[];
  skipped?: { reason: string }[];
};

type GroupSummary = {
  group: Group;
  members: GroupMember[];
  yourShare: number | null;
  xmtp: GroupXmtp | null;
};

export default function MiniappPage() {
  const { ready: privyReady, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userWallet, setUserWallet] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupRent, setNewGroupRent] = useState("");
  const [newGroupCollector, setNewGroupCollector] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [autopayStatus, setAutopayStatus] = useState<
    | "unknown"
    | "not_authorized"
    | "approved"
    | "authorized"
    | "processing"
    | "failed"
    | "pending"
  >("unknown");
  const [loadingAutopay, setLoadingAutopay] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundingAvailable, setFundingAvailable] = useState(true);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [paymentStatusText, setPaymentStatusText] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [sendingPaymentUpdate, setSendingPaymentUpdate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [viewMode, setViewMode] = useState<"landing" | "my" | "create" | "join">(
    "landing"
  );
  const [actionsStacked, setActionsStacked] = useState(true);
  const [inviteWallet, setInviteWallet] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinResult, setJoinResult] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletBalanceChain, setWalletBalanceChain] = useState<string | null>(
    null
  );
  const [walletBalanceToken, setWalletBalanceToken] = useState<string | null>(
    null
  );
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [xmtpStatus, setXmtpStatus] = useState<GroupXmtp | null>(null);
  const [loadingXmtpStatus, setLoadingXmtpStatus] = useState(false);
  const [xmtpMessage, setXmtpMessage] = useState("");
  const [sendingXmtp, setSendingXmtp] = useState(false);
  const [xmtpDelivery, setXmtpDelivery] = useState<XmtpDelivery | null>(null);

  useEffect(() => {
    if (!privyReady || !authenticated) return;

    console.log("Privy wallets:", wallets);

    const embeddedWallet = wallets?.find((w) => w.walletClientType === "privy");

    if (embeddedWallet?.address) {
      setUserWallet(embeddedWallet.address);
    } else {
      setUserWallet(null);
    }

    setLoadingWallet(false);
  }, [privyReady, authenticated, wallets]);

  // After Privy + wallets ready: pick wallet, register with backend, load groups
  useEffect(() => {
    if (!privyReady || !authenticated || !user || loadingWallet) return;

    const privyUserId = user.id;
    const email = user.email?.address || null;

    const walletAddr = userWallet;

    async function syncUserAndLoadGroups() {
      try {
        setLoading(true);

        // 1) Register/login with backend
        const authRes = await fetch(`${BACKEND_URL}/auth/privy-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ privyUserId, email, walletAddress: walletAddr }),
        });
        const authJson = await parseJsonResponse(authRes);
        setUserId(authJson.id);

        // 2) Fetch groups for this user
        const groupsRes = await fetch(
          `${BACKEND_URL}/groups?userId=${encodeURIComponent(authJson.id)}`
        );
        const groupsJson = await parseJsonResponse(groupsRes);
        setGroups(groupsJson);
      } catch (err) {
        console.error("Error syncing with backend", err);
      } finally {
        setLoading(false);
      }
    }

    syncUserAndLoadGroups();
  }, [privyReady, authenticated, user, userWallet, loadingWallet]);

  async function handleCreateGroup() {
    if (!userId) return;
    if (!newGroupName || !newGroupRent) {
      alert("Please fill all fields");
      return;
    }

    const totalRent = Number(newGroupRent);
    if (Number.isNaN(totalRent)) {
      alert("Rent must be a number");
      return;
    }

    const collectorAddress = newGroupCollector.trim();
    if (!collectorAddress) {
      alert("Collector address is missing");
      return;
    }

    try {
      setCreating(true);

      const res = await fetch(`${BACKEND_URL}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: newGroupName,
          totalRent,
          token: "USDC",
          collectorAddress,
        }),
      });

      const json = await parseJsonResponse(res);

      if (!res.ok) {
        console.error("Create group error", json);
        alert("Failed to create group");
        return;
      }

      const groupsRes = await fetch(
        `${BACKEND_URL}/groups?userId=${encodeURIComponent(userId)}`
      );
      const groupsJson = await parseJsonResponse(groupsRes);
      setGroups(groupsJson);

      setNewGroupName("");
      setNewGroupRent("");
      setNewGroupCollector("");
    } catch (e) {
      console.error("Error creating group", e);
      alert("Error creating group");
    } finally {
      setCreating(false);
    }
  }

  async function handleSelectGroup(groupId: string) {
    if (!userId) return;
    setSelectedGroupId(groupId);
    setLoadingSummary(true);
    setSummary(null);
    setAutopayEnabled(false);
    setAutopayStatus("unknown");
    setXmtpStatus(null);
    setXmtpDelivery(null);

    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${groupId}/summary?userId=${encodeURIComponent(
          userId
        )}`
      );
      const json = await parseJsonResponse(res);

      if (!res.ok) {
        console.error("Error fetching summary", json);
        return;
      }

      setSummary(json);
      loadAutopayStatus(groupId);
      loadXmtpStatus(groupId);
    } catch (e) {
      console.error("Error fetching summary", e);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadAutopayStatus(groupId: string) {
    if (!userId) return;
    setLoadingAutopay(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${groupId}/x402/status?userId=${encodeURIComponent(
          userId
        )}`
      );
      const data = await parseJsonResponse(res);
      if (res.ok) {
        setAutopayStatus(data.status || "unknown");
        setAutopayEnabled(data.status === "approved");
      }
    } catch (err) {
      console.error("Error loading autopay status", err);
    } finally {
      setLoadingAutopay(false);
    }
  }

  async function loadXmtpStatus(groupId: string) {
    setLoadingXmtpStatus(true);
    try {
      const res = await fetch(`${BACKEND_URL}/groups/${groupId}/xmtp`);
      const data = await parseJsonResponse(res);
      if (res.ok) {
        setXmtpStatus(data);
        setSummary((prev) => (prev ? { ...prev, xmtp: data } : prev));
      }
    } catch (err) {
      console.error("Error loading XMTP status", err);
    } finally {
      setLoadingXmtpStatus(false);
    }
  }

  async function handleEnableAutopay() {
    if (!selectedGroupId || !userId) return;
    setLoadingAutopay(true);
    setAutopayStatus("processing");
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${selectedGroupId}/x402/initiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );
      const data = await parseJsonResponse(res);
      if (data.x402Url) {
        window.open(data.x402Url, "_blank");
      }
      // keep disabled until status endpoint confirms approval
      setAutopayEnabled(false);
      loadAutopayStatus(selectedGroupId);
    } catch (err) {
      console.error("Error enabling autopay", err);
      setAutopayStatus("failed");
    } finally {
      setLoadingAutopay(false);
    }
  }

  async function handleAddFunds() {
    const addr = userWallet;
    if (!addr) {
      alert("Wallet not ready yet");
      return;
    }
    if (!fundingAvailable) {
      setFundingError(
        "Funding is disabled for this app. Enable it in the Privy dashboard."
      );
      return;
    }
    try {
      setFunding(true);
      setFundingError(null);
      await fundWallet({ address: addr });
    } catch (err) {
      console.error("Funding error:", err);
      const message =
        err instanceof Error ? err.message : "Unable to start funding flow";
      setFundingError(message);
      if (message.toLowerCase().includes("funding") && message.toLowerCase().includes("not enabled")) {
        setFundingAvailable(false);
      }
      alert(message);
    } finally {
      setFunding(false);
    }
  }

  useEffect(() => {
    if (!userWallet) return;
    const walletAddr = userWallet;
    async function fetchBalance() {
      setLoadingBalance(true);
      try {
      const res = await fetch(
        `${BACKEND_URL}/wallets/${encodeURIComponent(
          walletAddr
        )}/balance?chain=ethereum`
      );
      const json = await parseJsonResponse(res);
        if (res.ok) {
          setWalletBalance(json.balance);
          setWalletBalanceChain(json.chain || "ethereum");
          setWalletBalanceToken(json.token || "ETH");
        } else {
          setWalletBalance(null);
        }
      } catch (err) {
        console.error("Balance fetch error", err);
        setWalletBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    }
    fetchBalance();
  }, [userWallet]);

  async function handleCopy(text?: string | null) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard");
    } catch (err) {
      console.error("Copy error", err);
    }
  }

  async function handleSendReminder() {
    if (!selectedGroupId || !summary) return;
    setSendingReminder(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${selectedGroupId}/xmtp/reminder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dueDate: reminderDate || null,
            note: reminderNote || null,
          }),
        }
      );
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json.error || "Failed to send reminder");
      }
      setSummary((prev) =>
        prev ? { ...prev, xmtp: json.xmtp || prev.xmtp } : prev
      );
      setXmtpStatus(json.xmtp || null);
      setXmtpDelivery(json.delivery || null);
      setReminderNote("");
    } catch (err) {
      console.error("Reminder send error", err);
      alert(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setSendingReminder(false);
    }
  }

  async function handleSendCustomXmtp() {
    if (!selectedGroupId || !userId) {
      alert("Select a group first");
      return;
    }
    if (!xmtpMessage.trim()) {
      alert("Enter a message to send");
      return;
    }
    setSendingXmtp(true);
    setXmtpDelivery(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${selectedGroupId}/xmtp/custom`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, text: xmtpMessage }),
        }
      );
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json.error || "Failed to send XMTP message");
      }
      setXmtpStatus(json.xmtp || null);
      setSummary((prev) =>
        prev ? { ...prev, xmtp: json.xmtp || prev.xmtp } : prev
      );
      setXmtpDelivery(json.delivery || null);
      setXmtpMessage("");
    } catch (err) {
      console.error("Custom XMTP send error", err);
      alert(err instanceof Error ? err.message : "Failed to send XMTP message");
    } finally {
      setSendingXmtp(false);
    }
  }

  async function handlePaymentUpdate() {
    if (!selectedGroupId || !summary || !userId) return;
    const amt =
      paymentAmount.trim() === "" ? undefined : Number(paymentAmount.trim());
    if (amt !== undefined && Number.isNaN(amt)) {
      alert("Amount must be a number");
      return;
    }

    setSendingPaymentUpdate(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${selectedGroupId}/xmtp/payment-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            status: paymentStatusText || "updated their payment status",
            amount: amt,
            token: summary.group.token,
          }),
        }
      );
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json.error || "Failed to send update");
      }
      setSummary((prev) =>
        prev ? { ...prev, xmtp: json.xmtp || prev.xmtp } : prev
      );
      setXmtpStatus(json.xmtp || null);
      setXmtpDelivery(json.delivery || null);
      setPaymentStatusText("");
      setPaymentAmount("");
    } catch (err) {
      console.error("Payment update send error", err);
      alert(err instanceof Error ? err.message : "Failed to send update");
    } finally {
      setSendingPaymentUpdate(false);
    }
  }

  async function handleInviteMember() {
    if (!selectedGroupId || !userId) {
      alert("Select a group first");
      return;
    }
    if (!inviteWallet) {
      alert("Enter a wallet address");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: selectedGroupId,
          userId,
          walletAddress: inviteWallet,
        }),
      });
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json.error || "Failed to create invite");
      }
      setInviteCode(json.code || null);
      alert(`Invite created${json.code ? `: ${json.code}` : ""}`);
    } catch (err) {
      console.error("Invite error", err);
      alert(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleJoinGroup() {
    if (!userId) {
      alert("Login first");
      return;
    }
    if (!joinCode.trim()) {
      alert("Enter invite code");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/invites/${encodeURIComponent(joinCode.trim())}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json.error || "Failed to join group");
      }
      setJoinResult("Joined successfully");
      setViewMode("my");
      setSelectedGroupId(json.groupId || null);
      const groupsRes = await fetch(
        `${BACKEND_URL}/groups?userId=${encodeURIComponent(userId)}`
      );
      const groupsJson = await parseJsonResponse(groupsRes);
      setGroups(groupsJson);
    } catch (err) {
      console.error("Join error", err);
      setJoinResult(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUserId(null);
      setGroups([]);
      setSelectedGroupId(null);
      setSummary(null);
      setUserWallet(null);
      setAutopayEnabled(false);
      setAutopayStatus("unknown");
      setXmtpStatus(null);
      setXmtpDelivery(null);
      setXmtpMessage("");
      router.push("/");
    }
  }

  // ---------- UI ----------

  if (!privyReady) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Initializing miniapp...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <button
          onClick={login}
          className="px-4 py-2 rounded bg-black text-white text-sm"
        >
          Login with Privy
        </button>
      </main>
    );
  }

  if (loading || !userId) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Connecting to backend...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl flex flex-col gap-4">
        {/* TOP BAR - profile */}
        <div className="w-full flex justify-end px-4 py-3 border-b bg-white sticky top-0 z-10 shadow rounded-2xl relative">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProfile((p) => !p)}
              className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold text-sm hover:opacity-80"
              aria-label="Profile"
            >
              {user?.email?.address
                ? user.email.address.slice(0, 2).toUpperCase()
                : "U"}
            </button>

            <button
              onClick={handleAddFunds}
              disabled={!userWallet || loadingWallet || funding || !fundingAvailable}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-black text-xs px-3 py-1 rounded-lg font-semibold"
            >
              {funding ? "Opening..." : fundingAvailable ? "Add Funds" : "Funding off"}
            </button>
            <button
              onClick={handleLogout}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs px-3 py-1 rounded-lg font-semibold"
            >
              Logout
            </button>
          </div>

          {showProfile && (
            <div className="absolute right-3 top-14 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">Initials</p>
                  <p className="font-semibold text-slate-800">
                    {user?.email?.address
                      ? user.email.address.slice(0, 2).toUpperCase()
                      : "Not set"}
                  </p>
                </div>
                <button
                  onClick={() => setShowProfile(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-700"
                >
                  Close
                </button>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Email</p>
                <p className="font-medium text-slate-800">
                  {user?.email?.address || "Not set"}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">Wallet</p>
                  <p className="font-mono text-[10px] text-slate-800 break-all max-w-[180px]">
                    {userWallet || "Not set"}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(userWallet)}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Balance</p>
                <p className="font-semibold text-slate-800">
                  {loadingBalance
                    ? "Loading..."
                    : walletBalance
                    ? `${walletBalance} ${walletBalanceToken || "ETH"}`
                    : "Unavailable"}
                </p>
                <p className="text-[10px] text-slate-500">
                  Chain: {walletBalanceChain || "ethereum"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="w-full bg-white rounded-2xl shadow-lg p-4 md:p-6 space-y-4">
          <header className="space-y-1 border-b pb-3">
            <h1 className="text-xl font-bold text-slate-900">Group Rent Autopay</h1>
            <p className="text-xs text-slate-500">
              You are signed in. Choose an action below to manage your groups.
            </p>
          </header>

          <div
            className={`grid gap-2 ${
              actionsStacked ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"
            }`}
          >
            <button
              onClick={() => {
                setActionsStacked(false);
                setViewMode("my");
              }}
              className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                viewMode === "my"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200"
              } sm:order-1`}
            >
              My groups
            </button>
            <button
              onClick={() => {
                setActionsStacked(false);
                setViewMode("create");
              }}
              className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                viewMode === "create"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200"
              } sm:order-2`}
            >
              Create group
            </button>
            <button
              onClick={() => {
                setActionsStacked(false);
                setViewMode("join");
              }}
              className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                viewMode === "join"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200"
              } sm:order-3`}
            >
              Join group
            </button>
          </div>

          {viewMode === "my" && (
            <div className="grid md:grid-cols-[280px,1fr] gap-4">
              <div className="space-y-4">
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">
                      Your Groups
                    </h2>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      You are not in any groups yet. Create one below.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {groups.map((g) => {
                        const isSelected = selectedGroupId === g.id;
                        return (
                          <li key={g.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectGroup(g.id)}
                              className={`w-full flex items-center justify-between rounded-lg border px-2 py-1.5 transition text-left ${
                                isSelected
                                  ? "border-indigo-500 bg-indigo-50"
                                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                              }`}
                            >
                              <span className="font-medium text-slate-800">
                                {g.name}
                              </span>
                              <span className="text-[11px] text-slate-600">
                                {g.totalRent} {g.token}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>

              <div className="space-y-3">
                <section className="h-full border rounded-xl px-3 py-3 bg-slate-50">
                  {!selectedGroupId && (
                    <p className="text-xs text-slate-500">
                      Select a group to view details, autopay, XMTP updates, and members.
                    </p>
                  )}

                  {loadingSummary && (
                    <p className="text-xs text-slate-500">Loading group details...</p>
                  )}

                  {summary && !loadingSummary && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[11px] uppercase text-slate-500">Group</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {summary.group.name}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Total rent:{" "}
                          <span className="font-medium">
                            {summary.group.totalRent} {summary.group.token}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Collector:{" "}
                          <span className="font-mono">
                            {formatAddress(summary.group.collectorAddress)}
                          </span>
                        </p>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-[11px] text-slate-500 mb-1">Your share</p>
                        <p className="text-lg font-semibold text-indigo-600">
                          {summary.yourShare ?? "--"} {summary.group.token}
                        </p>
                      </div>

                      <section className="border rounded-xl p-4 bg-gray-50 shadow-sm space-y-2">
                        <h3 className="text-sm font-semibold">Autopay</h3>
                        <p className="text-xs text-gray-700">
                          {autopayEnabled
                            ? "Autopay is enabled for your wallet."
                            : autopayStatus === "processing"
                            ? "Autopay setup is processing. Complete authorization to enable."
                            : autopayStatus === "pending"
                            ? "Autopay authorization requested. Awaiting approval."
                            : autopayStatus === "failed"
                            ? "Autopay failed to start. Please try again."
                            : "Autopay is not enabled yet."}
                        </p>
                        {!autopayEnabled && autopayStatus && autopayStatus !== "unknown" && (
                          <p className="text-[11px] text-slate-500">Status: {autopayStatus}</p>
                        )}
                        {!autopayEnabled && (
                          <button
                            onClick={handleEnableAutopay}
                            disabled={loadingAutopay}
                            className="mt-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
                          >
                            {loadingAutopay ? "Enabling..." : "Enable Autopay"}
                          </button>
                        )}
                      </section>

                      <section className="border rounded-xl p-4 bg-white shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">
                              XMTP updates
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              Broadcast reminders and payment status updates to member wallets via XMTP.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => selectedGroupId && loadXmtpStatus(selectedGroupId)}
                              disabled={loadingXmtpStatus}
                              className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-60"
                            >
                              {loadingXmtpStatus ? "Refreshing..." : "Refresh"}
                            </button>
                            <span
                              className={`text-[11px] px-2 py-1 rounded-full border ${
                                (xmtpStatus || summary.xmtp)?.conversationId
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {(xmtpStatus || summary.xmtp)?.conversationId
                                ? "Thread live"
                                : "Will start on first send"}
                            </span>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1">
                            <p className="text-slate-500">Conversation ID</p>
                            <p className="font-mono text-[10px] break-all">
                              {(xmtpStatus || summary.xmtp)?.conversationId ||
                                "Created when the first message is sent"}
                            </p>
                            <p className="text-slate-500">
                              Last send:{" "}
                              {(xmtpStatus || summary.xmtp)?.lastSentAt
                                ? new Date(
                                    (xmtpStatus || summary.xmtp)?.lastSentAt as string
                                  ).toLocaleString()
                                : "Not yet sent"}
                            </p>
                            <p className="text-slate-500">
                              Recipients: {(xmtpStatus || summary.xmtp)?.members?.length || 0}
                            </p>
                            {(xmtpStatus || summary.xmtp)?.lastMessage && (
                              <p className="text-slate-500">
                                Last message: {(xmtpStatus || summary.xmtp)?.lastMessage}
                              </p>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-slate-700">
                                Rent reminder
                              </p>
                              <button
                                onClick={handleSendReminder}
                                disabled={sendingReminder}
                                className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                              >
                                {sendingReminder ? "Sending..." : "Send"}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="date"
                                value={reminderDate}
                                onChange={(e) => setReminderDate(e.target.value)}
                                className="w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                              />
                              <input
                                type="text"
                                placeholder="Optional note"
                                value={reminderNote}
                                onChange={(e) => setReminderNote(e.target.value)}
                                className="w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-slate-700">
                                Payment update
                              </p>
                              <button
                                onClick={handlePaymentUpdate}
                                disabled={sendingPaymentUpdate}
                                className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                              >
                                {sendingPaymentUpdate ? "Sending..." : "Broadcast"}
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="text"
                                placeholder="Status (e.g. Paid)"
                                value={paymentStatusText}
                                onChange={(e) => setPaymentStatusText(e.target.value)}
                                className="w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                              />
                              <input
                                type="number"
                                placeholder="Amount"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                className="w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                              />
                              <div className="text-[11px] text-slate-500 flex items-center">
                                Sends as you to all group wallets.
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-slate-700">
                                Custom XMTP message
                              </p>
                              <button
                                onClick={handleSendCustomXmtp}
                                disabled={sendingXmtp}
                                className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                              >
                                {sendingXmtp ? "Sending..." : "Send"}
                              </button>
                            </div>
                            <textarea
                              placeholder="Write a message to broadcast to all group wallets"
                              value={xmtpMessage}
                              onChange={(e) => setXmtpMessage(e.target.value)}
                              className="w-full border rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                              rows={3}
                            />
                            {xmtpDelivery && (
                              <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
                                <p className="text-slate-700 font-semibold">Last delivery</p>
                                <p className="text-slate-600">
                                  Conversation: {xmtpDelivery.conversationId || "n/a"}
                                </p>
                                <p className="text-slate-600">
                                  Sent to: {xmtpDelivery.sentTo?.length || 0}
                                </p>
                                {xmtpDelivery.unreachable?.length ? (
                                  <p className="text-amber-700">
                                    Unreachable: {xmtpDelivery.unreachable.join(", ")}
                                  </p>
                                ) : null}
                                {xmtpDelivery.failed?.length ? (
                                  <p className="text-red-700">
                                    Failed:{" "}
                                    {xmtpDelivery.failed
                                      .map((f) => `${f.address || "unknown"} (${f.error || f.reason})`)
                                      .join(", ")}
                                  </p>
                                ) : null}
                                {xmtpDelivery.skipped?.length ? (
                                  <p className="text-slate-600">
                                    Skipped: {xmtpDelivery.skipped.map((s) => s.reason).join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </section>

                      <div className="space-y-2 border rounded-xl p-4 bg-white shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">
                            Invite member
                          </p>
                          {inviteCode && (
                            <span className="text-[11px] text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full border border-emerald-200">
                              Code: {inviteCode}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <input
                            type="text"
                            placeholder="Wallet address"
                            value={inviteWallet}
                            onChange={(e) => setInviteWallet(e.target.value)}
                            className="col-span-2 border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            onClick={handleInviteMember}
                            disabled={inviting}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
                          >
                            {inviting ? "Sending..." : "Create invite"}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Share the invite code or use XMTP to notify the wallet owner.
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-slate-500 mb-1">
                          Members & autopay
                        </p>
                        <ul className="space-y-1 text-[11px]">
                          {summary.members.map((m) => (
                            <li
                              key={m.userId}
                              className="flex items-center justify-between bg-white border border-slate-200 rounded px-2 py-1"
                            >
                              <div>
                                <p className="font-medium text-slate-800">
                                  {m.email || m.userId}
                                </p>
                                <p className="font-mono text-[10px] text-slate-500 truncate max-w-[160px]">
                                  {m.walletAddress || "No wallet"}
                                </p>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                                  m.hasAutopay
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    m.hasAutopay ? "bg-emerald-500" : "bg-slate-500"
                                  }`}
                                />
                                {m.hasAutopay ? "Autopay on" : "Autopay off"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        Next: we will add a Settle Now flow that links XMTP notifications.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {viewMode === "create" && (
            <div className="border rounded-2xl p-4 bg-slate-50 space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">Create a Group</h2>
              <div className="space-y-2 text-xs">
                <input
                  type="text"
                  placeholder="Group name (e.g. Flat 401 Rent)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="number"
                  placeholder="Total monthly rent (e.g. 1000)"
                  value={newGroupRent}
                  onChange={(e) => setNewGroupRent(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Collector wallet (enter wallet address)"
                  value={newGroupCollector}
                  onChange={(e) => setNewGroupCollector(e.target.value)}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleCreateGroup}
                  disabled={creating}
                  className="w-full px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create Group"}
                </button>
              </div>
            </div>
          )}

          {viewMode === "join" && (
            <div className="border rounded-2xl p-4 bg-slate-50 space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">Join a Group</h2>
              <p className="text-[11px] text-slate-500">
                Paste an invite code shared by a member to join their group.
              </p>
              <div className="grid grid-cols-[2fr,auto] gap-2">
                <input
                  type="text"
                  placeholder="Invite code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleJoinGroup}
                  disabled={joining}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {joining ? "Joining..." : "Join"}
                </button>
              </div>
              {joinResult && (
                <p className="text-[11px] text-slate-600">{joinResult}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

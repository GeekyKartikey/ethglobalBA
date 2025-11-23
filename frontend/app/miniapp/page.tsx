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
  rentDueDay?: number;
  createdBy?: string;
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

type XmtpLogEntry = {
  id: string;
  type: string;
  text: string;
  actor?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

type GroupSummary = {
  group: Group;
  members: GroupMember[];
  yourShare: number | null;
  xmtp: GroupXmtp | null;
};

type InvitePreview = {
  groupId: string | null;
  groupName: string;
  totalRent: number | null;
  token: string | null;
  collectorAddress: string | null;
  rentDueDay: number | null;
  status: string;
  walletAddress: string | null;
  memberCount: number;
  members: GroupMember[];
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
  const [newGroupDueDay, setNewGroupDueDay] = useState("1");
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
  const [autopayDay, setAutopayDay] = useState("");
  const [savingAutopayDay, setSavingAutopayDay] = useState(false);
  const [autopayDayMessage, setAutopayDayMessage] = useState<string | null>(null);
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
  const [joinPreview, setJoinPreview] = useState<InvitePreview | null>(null);
  const [loadingJoinPreview, setLoadingJoinPreview] = useState(false);
  const [joinPreviewError, setJoinPreviewError] = useState<string | null>(null);
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
  const [xmtpFeed, setXmtpFeed] = useState<XmtpLogEntry[]>([]);
  const [loadingXmtpFeed, setLoadingXmtpFeed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupActions, setShowGroupActions] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

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

    const dueDay = newGroupDueDay ? Number(newGroupDueDay) : 1;
    if (Number.isNaN(dueDay) || dueDay < 1 || dueDay > 28) {
      alert("Autopay day must be between 1 and 28");
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
          rentDueDay: dueDay,
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
      setNewGroupDueDay("1");
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
    setAutopayDay("");
    setAutopayDayMessage(null);
    setXmtpStatus(null);
    setXmtpDelivery(null);
    setXmtpFeed([]);

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
      if (json?.group?.rentDueDay) {
        setAutopayDay(String(json.group.rentDueDay));
      }
      loadAutopayStatus(groupId);
      loadXmtpStatus(groupId);
      loadXmtpLog(groupId, userId);
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

  async function loadXmtpLog(groupId: string, userId?: string | null) {
    if (!groupId) return;
    setLoadingXmtpFeed(true);
    try {
      const url = new URL(`${BACKEND_URL}/groups/${groupId}/xmtp/log`);
      if (userId) url.searchParams.set("userId", userId);
      const res = await fetch(url.toString());
      const data = await parseJsonResponse(res);
      if (res.ok) {
        setXmtpFeed(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch (err) {
      console.error("Error loading XMTP feed", err);
    } finally {
      setLoadingXmtpFeed(false);
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

  async function handleSaveAutopayDay() {
    if (!selectedGroupId || !userId) return;
    const dayNum = Number(autopayDay);
    if (Number.isNaN(dayNum) || dayNum < 1 || dayNum > 28) {
      alert("Autopay date must be between 1 and 28 (day of month).");
      return;
    }
    setSavingAutopayDay(true);
    setAutopayDayMessage(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${selectedGroupId}/rent-due-day`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, rentDueDay: dayNum }),
        }
      );
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save autopay date");
      }
      setAutopayDay(String(json.rentDueDay || dayNum));
      setAutopayDayMessage("Autopay date saved");
      setSummary((prev) =>
        prev
          ? { ...prev, group: { ...prev.group, rentDueDay: json.rentDueDay || dayNum } }
          : prev
      );
    } catch (err) {
      console.error("Autopay day save error", err);
      alert(err instanceof Error ? err.message : "Failed to save autopay date");
    } finally {
      setSavingAutopayDay(false);
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
            userId,
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
      loadXmtpLog(selectedGroupId, userId);
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
      loadXmtpLog(selectedGroupId, userId);
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
      loadXmtpLog(selectedGroupId, userId);
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

  async function handleLeaveGroup() {
    if (!selectedGroupId || !userId) return;
    setLeavingGroup(true);
    try {
      const res = await fetch(`${BACKEND_URL}/groups/${selectedGroupId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to leave group");
      }
      setSelectedGroupId(null);
      setSummary(null);
      setShowSettings(false);
      setXmtpFeed([]);
      const groupsRes = await fetch(
        `${BACKEND_URL}/groups?userId=${encodeURIComponent(userId)}`
      );
      const groupsJson = await parseJsonResponse(groupsRes);
      setGroups(groupsJson);
    } catch (err) {
      console.error("Leave group error", err);
      alert(err instanceof Error ? err.message : "Failed to leave group");
    } finally {
      setLeavingGroup(false);
    }
  }

  async function handlePreviewInvite() {
    if (!joinCode.trim()) {
      alert("Enter invite code to preview");
      return;
    }
    setLoadingJoinPreview(true);
    setJoinPreview(null);
    setJoinPreviewError(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/invites/${encodeURIComponent(joinCode.trim())}`
      );
      const json = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(json?.error || "Unable to preview invite");
      }
      setJoinPreview(json as InvitePreview);
    } catch (err) {
      console.error("Preview invite error", err);
      const message = err instanceof Error ? err.message : "Failed to preview invite";
      setJoinPreviewError(message);
      alert(message);
    } finally {
      setLoadingJoinPreview(false);
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

  const isBooting = !privyReady || loading || !userId;

  const isOwner = summary?.group?.createdBy === userId;

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl flex flex-col gap-4 relative">
        {(!privyReady || isBooting || !authenticated) && (
          <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 flex items-center justify-center">
            {!privyReady ? (
              <div className="text-sm text-slate-700 font-semibold">Initializing...</div>
            ) : !authenticated ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-slate-700">Please sign in to continue</p>
                <button
                  onClick={login}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                >
                  Login with Privy
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-700 font-semibold">Connecting...</div>
            )}
          </div>
        )}
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
                <section className="space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-800">Your Groups</h2>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowGroupActions((v) => !v)}
                        className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg leading-none shadow hover:bg-indigo-700"
                        aria-label="Create or join group"
                      >
                        +
                      </button>
                      {showGroupActions && (
                        <div className="absolute right-0 mt-2 w-36 bg-white border border-slate-200 rounded-lg shadow-lg p-2 space-y-2 z-10">
                          <button
                            onClick={() => {
                              setViewMode("create");
                              setShowGroupActions(false);
                            }}
                            className="w-full text-left text-xs px-3 py-2 rounded-md hover:bg-slate-100"
                          >
                            Create group
                          </button>
                          <button
                            onClick={() => {
                              setViewMode("join");
                              setShowGroupActions(false);
                            }}
                            className="w-full text-left text-xs px-3 py-2 rounded-md hover:bg-slate-100"
                          >
                            Join group
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-xs text-slate-500">You are not in any groups yet. Use the + button to create or join.</p>
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
                              <div>
                                <p className="font-medium text-slate-800">{g.name}</p>
                                <p className="text-[10px] text-slate-500">Rent: {g.totalRent} {g.token}</p>
                              </div>
                              <span className="text-[11px] text-slate-600">Day {g.rentDueDay ?? 1}</span>
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
                    <p className="text-xs text-slate-500">Select a group to view details, autopay, XMTP updates, and members.</p>
                  )}

                  {loadingSummary && <p className="text-xs text-slate-500">Loading group details...</p>}

                  {summary && !loadingSummary && (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase text-slate-500">Group</p>
                          <p className="text-sm font-semibold text-slate-900">{summary.group.name}</p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Total rent: <span className="font-medium">{summary.group.totalRent} {summary.group.token}</span>
                          </p>
                          <p className="text-[11px] text-slate-500">Collector: <span className="font-mono">{formatAddress(summary.group.collectorAddress)}</span></p>
                          <p className="text-[11px] text-slate-500">Rent day: <span className="font-medium">{summary.group.rentDueDay ?? 1}</span> of each month.</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              (xmtpStatus || summary.xmtp)?.conversationId
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {(xmtpStatus || summary.xmtp)?.conversationId ? "Thread live" : "Starts on first send"}
                          </span>
                          <button
                            onClick={() => setShowSettings(true)}
                            className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold"
                            aria-label="Group settings"
                          >
                            ??
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <p className="text-[11px] text-slate-500 mb-1">Your share</p>
                        <p className="text-lg font-semibold text-indigo-600">{summary.yourShare ?? "--"} {summary.group.token}</p>
                      </div>

                      <section className="border rounded-xl p-4 bg-gray-50 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Autopay</h3>
                          {!autopayEnabled && (
                            <button
                              onClick={handleEnableAutopay}
                              disabled={loadingAutopay}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
                            >
                              {loadingAutopay ? "Enabling..." : "Enable Autopay"}
                            </button>
                          )}
                        </div>
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
                        <div className="grid sm:grid-cols-[1fr,auto] gap-2 items-end">
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-600">Autopay date (day of month)</label>
                            <input
                              type="number"
                              min={1}
                              max={28}
                              value={autopayDay}
                              onChange={(e) => {
                                setAutopayDay(e.target.value);
                                setAutopayDayMessage(null);
                              }}
                              disabled={!isOwner}
                              className="w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black disabled:bg-slate-100"
                            />
                            <p className="text-[10px] text-slate-500">
                              Set by the owner. Autopay runs on day {summary.group.rentDueDay ?? "1"} each month.
                            </p>
                          </div>
                          <button
                            onClick={handleSaveAutopayDay}
                            disabled={savingAutopayDay || !autopayDay || !isOwner}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-2 rounded-lg disabled:opacity-60"
                          >
                            {savingAutopayDay ? "Saving..." : "Save date"}
                          </button>
                        </div>
                        {autopayDayMessage && <p className="text-[11px] text-emerald-700">{autopayDayMessage}</p>}
                      </section>

                      <section className="border rounded-xl p-4 bg-white shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-800">XMTP updates</h3>
                            <p className="text-[11px] text-slate-500">System notifications only; no member chatting.</p>
                          </div>
                          <button
                            onClick={() => selectedGroupId && loadXmtpStatus(selectedGroupId)}
                            disabled={loadingXmtpStatus}
                            className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-60"
                          >
                            {loadingXmtpStatus ? "Refreshing..." : "Refresh"}
                          </button>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1">
                          <p className="text-slate-500">Conversation ID</p>
                          <p className="font-mono text-[10px] break-all">
                            {(xmtpStatus || summary.xmtp)?.conversationId || "Created on first send"}
                          </p>
                          <p className="text-slate-500">
                            Last send: {(xmtpStatus || summary.xmtp)?.lastSentAt
                              ? new Date((xmtpStatus || summary.xmtp)?.lastSentAt as string).toLocaleString()
                              : "Not yet sent"}
                          </p>
                          <p className="text-slate-500">Recipients: {(xmtpStatus || summary.xmtp)?.members?.length || 0}</p>
                        </div>

                        <div className="border border-slate-200 rounded-lg bg-slate-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-slate-700">Updates feed</h4>
                            <button
                              onClick={() => selectedGroupId && loadXmtpLog(selectedGroupId, userId)}
                              disabled={loadingXmtpFeed}
                              className="text-[11px] px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-60"
                            >
                              {loadingXmtpFeed ? "Loading..." : "Reload"}
                            </button>
                          </div>
                          {loadingXmtpFeed ? (
                            <p className="text-[11px] text-slate-500">Loading feed...</p>
                          ) : xmtpFeed.length === 0 ? (
                            <p className="text-[11px] text-slate-500">No XMTP updates yet.</p>
                          ) : (
                            <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                              {xmtpFeed.map((m) => (
                                <li key={m.id} className="rounded-lg bg-white border border-slate-200 p-2 text-[11px]">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-slate-800">{m.type}</span>
                                    <span className="text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleString()}</span>
                                  </div>
                                  <p className="text-slate-700 text-xs whitespace-pre-wrap">{m.text}</p>
                                  {m.actor && <p className="text-[10px] text-slate-500 mt-1">Actor: {m.actor}</p>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </section>

                      <div className="border rounded-xl p-3 bg-white shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] text-slate-500">Members</p>
                          <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-100 text-slate-700">{summary.members.length}</span>
                        </div>
                        <ul className="space-y-1 text-[11px]">
                          {summary.members.map((m) => (
                            <li key={m.userId} className="flex items-center justify-between bg-white border border-slate-200 rounded px-2 py-1">
                              <div>
                                <p className="font-medium text-slate-800">{m.email || m.userId}</p>
                                <p className="font-mono text-[10px] text-slate-500 truncate max-w-[160px]">{m.walletAddress || "No wallet"}</p>
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                                m.hasAutopay ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${m.hasAutopay ? "bg-emerald-500" : "bg-slate-500"}`} />
                                {m.hasAutopay ? "Autopay on" : "Autopay off"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-500">Need to leave?</p>
                        <button
                          onClick={handleLeaveGroup}
                          disabled={leavingGroup}
                          className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          {leavingGroup ? "Leaving..." : "Leave group"}
                        </button>
                      </div>
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
                  type="number"
                  min={1}
                  max={28}
                  placeholder="Autopay day of month (1-28)"
                  value={newGroupDueDay}
                  onChange={(e) => setNewGroupDueDay(e.target.value)}
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
              <div className="grid grid-cols-[2fr,auto,auto] gap-2 items-center">
                <input
                  type="text"
                  placeholder="Invite code"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    setJoinPreview(null);
                    setJoinPreviewError(null);
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handlePreviewInvite}
                  disabled={loadingJoinPreview}
                  className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 text-sm font-semibold disabled:opacity-60"
                >
                  {loadingJoinPreview ? "Loading..." : "Preview"}
                </button>
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
              {joinPreviewError && (
                <p className="text-[11px] text-red-600">{joinPreviewError}</p>
              )}
              {joinPreview && (
                <div className="border rounded-xl p-3 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase text-slate-500">Group</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {joinPreview.groupName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Rent: {joinPreview.totalRent || "--"} {joinPreview.token || ""}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Autopay date: day {joinPreview.rentDueDay || "1"} each month
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Collector:{" "}
                        <span className="font-mono text-[10px]">
                          {formatAddress(joinPreview.collectorAddress)}
                        </span>
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full border bg-slate-100 text-slate-700">
                      Invite status: {joinPreview.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 mb-1">
                      Members who will be in this group
                    </p>
                    {joinPreview.members.length === 0 ? (
                      <p className="text-[11px] text-slate-400">No members yet.</p>
                    ) : (
                      <ul className="space-y-1 text-[11px]">
                        {joinPreview.members.map((m) => (
                          <li
                            key={m.userId}
                            className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-2 py-1"
                          >
                            <div>
                              <p className="font-medium text-slate-800">{m.email || m.userId}</p>
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
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showSettings && summary && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500">Group settings</p>
                <p className="text-sm font-semibold text-slate-800">{summary.group.name}</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-sm text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50"
              >
                Close
              </button>
            </div>

            {isOwner ? (
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-2 border rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">Rent reminder</p>
                    <button
                      onClick={handleSendReminder}
                      disabled={sendingReminder}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md disabled:opacity-60"
                    >
                      {sendingReminder ? "Sending..." : "Send"}
                    </button>
                  </div>
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

                <div className="space-y-2 border rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">Group payment update</p>
                    <button
                      onClick={handlePaymentUpdate}
                      disabled={sendingPaymentUpdate}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md disabled:opacity-60"
                    >
                      {sendingPaymentUpdate ? "Sending..." : "Broadcast"}
                    </button>
                  </div>
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
                </div>

                <div className="space-y-2 border rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">Announcement</p>
                    <button
                      onClick={handleSendCustomXmtp}
                      disabled={sendingXmtp}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md disabled:opacity-60"
                    >
                      {sendingXmtp ? "Sending..." : "Send"}
                    </button>
                  </div>
                  <textarea
                    placeholder="Write a short announcement to broadcast"
                    value={xmtpMessage}
                    onChange={(e) => setXmtpMessage(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                    rows={3}
                  />
                </div>

                <div className="space-y-2 border rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">Invite via wallet</p>
                    <button
                      onClick={handleInviteMember}
                      disabled={inviting}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md disabled:opacity-60"
                    >
                      {inviting ? "Creating..." : "Create invite"}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Wallet address"
                    value={inviteWallet}
                    onChange={(e) => setInviteWallet(e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-black"
                  />
                  {inviteCode && (
                    <p className="text-[11px] text-emerald-700">Invite code: {inviteCode}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="border rounded-lg p-3 bg-slate-50">
                  <p className="font-semibold text-slate-800 mb-1">Your autopay</p>
                  <p className="text-slate-600">
                    {autopayEnabled
                      ? "Autopay is enabled for your wallet."
                      : "Autopay is not enabled yet. You can enable it from the group view."}
                  </p>
                </div>
                <button
                  onClick={handleLeaveGroup}
                  disabled={leavingGroup}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  {leavingGroup ? "Leaving..." : "Leave group"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

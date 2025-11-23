"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets, useFundWallet } from "@privy-io/react-auth";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

function formatAddress(addr: string | null | undefined) {
  if (!addr) return "Not set";
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

type GroupSummary = {
  group: Group;
  members: GroupMember[];
  yourShare: number | null;
};

export default function MiniappPage() {
  const { ready: privyReady, authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();

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
  const [loadingAutopay, setLoadingAutopay] = useState(false);

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

    const walletAddr = userWallet;

    async function syncUserAndLoadGroups() {
      try {
        setLoading(true);

        const privyUserId = user.id;
        const email = user.email?.address || null;

        // 1) Register/login with backend
        const authRes = await fetch(`${BACKEND_URL}/auth/privy-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ privyUserId, email, walletAddress: walletAddr }),
        });
        const authJson = await authRes.json();
        setUserId(authJson.id);

        // 2) Fetch groups for this user
        const groupsRes = await fetch(
          `${BACKEND_URL}/groups?userId=${encodeURIComponent(authJson.id)}`
        );
        const groupsJson = await groupsRes.json();
        setGroups(groupsJson);
      } catch (err) {
        console.error("Error syncing with backend", err);
      } finally {
        setLoading(false);
      }
    }

    syncUserAndLoadGroups();
  }, [privyReady, authenticated, user, userWallet, loadingWallet]);

  useEffect(() => {
    if (userWallet && !newGroupCollector) {
      setNewGroupCollector(userWallet);
    }
  }, [userWallet, newGroupCollector]);

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

    const collectorAddress = newGroupCollector || userWallet || "";
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

      const json = await res.json();

      if (!res.ok) {
        console.error("Create group error", json);
        alert("Failed to create group");
        return;
      }

      const groupsRes = await fetch(
        `${BACKEND_URL}/groups?userId=${encodeURIComponent(userId)}`
      );
      const groupsJson = await groupsRes.json();
      setGroups(groupsJson);

      setNewGroupName("");
      setNewGroupRent("");
      setNewGroupCollector(userWallet || "");
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

    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${groupId}/summary?userId=${encodeURIComponent(
          userId
        )}`
      );
      const json = await res.json();

      if (!res.ok) {
        console.error("Error fetching summary", json);
        return;
      }

      setSummary(json);
      loadAutopayStatus(groupId);
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
      const data = await res.json();
      if (res.ok) {
        setAutopayEnabled(
          data.status === "authorized" || data.status === "approved"
        );
      }
    } catch (err) {
      console.error("Error loading autopay status", err);
    } finally {
      setLoadingAutopay(false);
    }
  }

  async function handleEnableAutopay() {
    if (!selectedGroupId || !userId) return;
    setLoadingAutopay(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/groups/${selectedGroupId}/x402/initiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );
      const data = await res.json();
      if (data.x402Url) {
        window.open(data.x402Url, "_blank");
      }
      setAutopayEnabled(true);
    } catch (err) {
      console.error("Error enabling autopay", err);
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
    try {
      await fundWallet({ address: addr });
    } catch (err) {
      console.error("Funding error:", err);
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
        <div className="w-full flex justify-end px-4 py-3 border-b bg-white sticky top-0 z-10 shadow rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold text-sm">
                {user?.email?.address?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex flex-col text-right leading-tight">
                <span className="text-xs font-semibold">
                  {user?.email?.address || "Logged in"}
                </span>
                <span className="text-[10px] font-mono opacity-70">
                  {userWallet
                    ? formatAddress(userWallet)
                    : loadingWallet
                    ? "Loading wallet..."
                    : "No wallet address"}
                </span>
              </div>
            </div>

            <button
              onClick={handleAddFunds}
              className="bg-emerald-500 hover:bg-emerald-600 text-black text-xs px-3 py-1 rounded-lg font-semibold"
            >
              Add Funds
            </button>
          </div>
        </div>

        <div className="w-full bg-white rounded-2xl shadow-lg p-4 md:p-6 space-y-4">
          <header className="space-y-1 border-b pb-3">
            <h1 className="text-xl font-bold text-slate-900">Group Rent Autopay</h1>
            <p className="text-xs text-slate-500">
              Logged in as{" "}
              <span className="font-medium">{user.email?.address || userId}</span>
            </p>
          </header>

          <section className="bg-slate-900 text-slate-50 rounded-xl px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Your wallet
              </p>
              <p className="text-sm font-mono break-all">
                {userWallet
                  ? formatAddress(userWallet)
                  : loadingWallet
                  ? "Loading wallet..."
                  : "No wallet address"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Collector by default</p>
              <p className="text-sm font-semibold">
                {newGroupCollector ? formatAddress(newGroupCollector) : "Not set"}
              </p>
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-4">
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

              <section className="space-y-2 border-t pt-3">
                <h2 className="text-sm font-semibold text-slate-800">
                  Create a Group
                </h2>
                <div className="space-y-2 text-xs">
                  <input
                    type="text"
                    placeholder="Group name (e.g. Flat 401 Rent)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="number"
                    placeholder="Total monthly rent (e.g. 1000)"
                    value={newGroupRent}
                    onChange={(e) => setNewGroupRent(e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Collector wallet (defaults to your wallet)"
                    value={newGroupCollector}
                    onChange={(e) => setNewGroupCollector(e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleCreateGroup}
                    disabled={creating}
                    className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Group"}
                  </button>
                </div>
              </section>
            </div>

            <div className="space-y-3">
              <section className="h-full border rounded-xl px-3 py-3 bg-slate-50">
                {!selectedGroupId && (
                  <p className="text-xs text-slate-500">
                    Select a group on the left to see details, autopay status and
                    settlement actions.
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
                          : "Autopay is not enabled yet."}
                      </p>
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
                      Next: we will add a Settle Now flow that links Filecoin and XMTP.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

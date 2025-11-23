"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const { login, ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) {
      router.push("/miniapp");
    }
  }, [ready, authenticated, router]);

  return (
    <main className="relative min-h-screen bg-slate-950 text-white flex items-center justify-center px-5 py-14 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 -top-16 w-72 h-72 bg-sky-500/20 blur-3xl" />
        <div className="absolute right-0 top-10 w-80 h-80 bg-blue-700/25 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 w-96 h-96 bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-10 items-center">
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-blue-900/50 backdrop-blur-md space-y-8">
          <div className="inline-flex items-center gap-3 bg-blue-600/20 px-4 py-2 rounded-full text-sm font-semibold border border-blue-400/30">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            Rent autopay built for shared living
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight">
              RentSplit
            </h1>
            <p className="text-lg text-white/80 max-w-xl">
              One tap to split, autopay, and stay current on rent with your
              housemates. Powered by x402 Payments + XMTP notifications.
            </p>
          </div>

          <div className="grid sm:grid-cols-[auto] gap-3">
            <button
              type="button"
              onClick={login}
              disabled={!ready || authenticated}
              className="bg-white text-blue-800 font-semibold px-5 py-3 rounded-xl shadow-lg shadow-blue-900/40 transition hover:-translate-y-0.5 hover:shadow-blue-900/60 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {authenticated ? "You're logged in" : "Login with Privy"}
            </button>
            <div className="flex items-center gap-2 text-sm text-emerald-200 bg-emerald-500/15 border border-emerald-300/30 rounded-xl px-4 py-3 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              <span>Base miniapp is live � log in to jump in.</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm text-white/70">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="font-semibold text-white">Autopay</p>
              <p>Authorize once, we handle the monthly pull.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="font-semibold text-white">Shared splits</p>
              <p>Everyone sees their share instantly.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-3">
              <p className="font-semibold text-white">XMTP alerts</p>
              <p>Group updates reach every member wallet.</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-b from-blue-800/70 to-slate-900/80 border border-white/10 rounded-3xl shadow-2xl shadow-blue-900/60 p-10 flex flex-col items-center gap-6 backdrop-blur-md">
          <div className="w-60 h-60 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-sky-700 flex items-center justify-center shadow-inner shadow-blue-900/50 border border-white/10">
            <RentSplitLogo />
          </div>
          <div className="text-center space-y-1">
            <p className="text-2xl font-bold">RentSplit</p>
            <p className="text-sm text-white/70">
              Peace of mind for every roommate
            </p>
          </div>
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="w-full flex flex-col gap-2 text-sm text-white/70">
            <div className="flex items-center justify-between">
              <span>Privy login</span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-300/30">
                Live
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>x402 autopay</span>
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-100 border border-blue-300/30">
                Ready
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>XMTP notifications</span>
              <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-300/30">
                Live
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function RentSplitLogo() {
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label="RentSplit logo"
      className="w-36 h-36 drop-shadow-lg"
    >
      <defs>
        <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#21c2ff" />
          <stop offset="50%" stopColor="#2ed6a1" />
          <stop offset="100%" stopColor="#f38b0f" />
        </linearGradient>
        <linearGradient id="handLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff4d6d" />
          <stop offset="100%" stopColor="#f9b233" />
        </linearGradient>
        <linearGradient id="handRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fba21b" />
          <stop offset="100%" stopColor="#ff6f61" />
        </linearGradient>
        <linearGradient id="house" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2fe8c3" />
          <stop offset="100%" stopColor="#1fa0ff" />
        </linearGradient>
      </defs>
      <circle
        cx="100"
        cy="100"
        r="86"
        fill="none"
        stroke="url(#ring)"
        strokeWidth="16"
      />
      <path
        d="M52 128c8 12 18 22 30 28 7 3 12-2 14-8 1-5-2-9-6-12l-12-10c-6-5-9-13-8-20"
        fill="none"
        stroke="url(#handLeft)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M148 128c-8 12-18 22-30 28-7 3-12-2-14-8-1-5 2-9 6-12l12-10c6-5 9-13 8-20"
        fill="none"
        stroke="url(#handRight)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(68 58)">
        <path
          d="M10 34c0-7 6-13 13-13h34c7 0 13 6 13 13s-6 13-13 13h-5l-6 6-6-6h-8c-7 0-13-6-13-13Z"
          fill="#3ac0ff"
          stroke="#007adf"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <circle cx="29" cy="34" r="5" fill="#fff" />
        <circle cx="44" cy="34" r="5" fill="#fff" />
        <rect x="51" y="28" width="7" height="12" rx="3" fill="#fff" />
      </g>
      <g transform="translate(70 92)">
        <polygon
          points="30 2 60 28 0 28"
          fill="url(#house)"
          stroke="#1170c2"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect
          x="12"
          y="28"
          width="36"
          height="26"
          rx="3"
          fill="#f15b2a"
          stroke="#bd2f1c"
          strokeWidth="3"
        />
        <rect x="26" y="34" width="8" height="14" rx="2" fill="#ffd166" />
      </g>
      <g
        transform="translate(96 108)"
        fill="#ffc436"
        stroke="#e29500"
        strokeWidth="3"
      >
        <circle cx="0" cy="0" r="10" />
        <circle cx="16" cy="10" r="10" />
        <circle cx="32" cy="2" r="10" />
        <text x="-4" y="4" fontSize="10" fontWeight="700" fill="#7a4e00">
          $
        </text>
        <text x="12" y="14" fontSize="10" fontWeight="700" fill="#7a4e00">
          $
        </text>
        <text x="28" y="6" fontSize="10" fontWeight="700" fill="#7a4e00">
          $
        </text>
      </g>
    </svg>
  );
}

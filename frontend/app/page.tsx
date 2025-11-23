"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";


export default function RedirectSplash() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/home");
  }, [router]);

  return (
    <main className="relative min-h-screen bg-slate-950 text-white flex items-center justify-center px-5 py-14 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 -top-16 w-72 h-72 bg-sky-500/20 blur-3xl" />
        <div className="absolute right-0 top-10 w-80 h-80 bg-blue-700/25 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 w-96 h-96 bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl bg-slate-900/70 border border-white/10 rounded-3xl p-10 shadow-2xl shadow-blue-900/50 backdrop-blur-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold leading-tight">RentSplit</h1>
          <p className="text-sm text-white/70">
            Loading your workspace…
          </p>
        </div>
      </div>
    </main>
  );
}

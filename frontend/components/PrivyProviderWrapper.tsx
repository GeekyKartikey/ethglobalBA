"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function PrivyProviderWrapper({ children }: Props) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  const isClient = typeof window !== "undefined";
  const isValidAppId = appId && appId.startsWith("app_");

  if (!isClient || !isValidAppId) {
    if (!isValidAppId) {
      console.warn(
        "Privy disabled: NEXT_PUBLIC_PRIVY_APP_ID is missing or invalid. Rendering without Privy."
      );
    }
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],

        // Make sure embedded wallets are auto–created
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },

        appearance: {
          theme: "light",
          accentColor: "#4F46E5",
          showWalletLoginFirst: true,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

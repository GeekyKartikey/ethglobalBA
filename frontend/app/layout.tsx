import type { Metadata } from "next";
import "./globals.css";
import PrivyProviderWrapper from "../components/PrivyProviderWrapper";

export const metadata: Metadata = {
  title: "Group Rent Autopay",
  description: "XMTP miniapp with Privy, x402, Filecoin",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}

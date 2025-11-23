import type { Metadata } from "next";
import "./globals.css";
import PrivyProviderWrapper from "../components/PrivyProviderWrapper";

export const metadata: Metadata = {
  title: "Group Rent Autopay",
  description: "XMTP miniapp with Privy and x402 autopay",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="fc:miniapp"
          content='{"version":"next","imageUrl":"https://ethglobal-ba.vercel.app/og.png","button":{"title":"Open RentSplit","action":{"type":"launch_miniapp","name":"RentSplit","url":"https://ethglobal-ba.vercel.app/miniapp"}}}'
        />
      </head>
      <body>
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}

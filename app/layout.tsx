import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeriTrace AI — Proof for Work That Matters",
  description: "Create verifiable evidence trails for human and AI work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

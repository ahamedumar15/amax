import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "amax",
  description:
    "Agent-native ERP for software and professional-services companies: delivery, people, payroll and money, with agents doing the record-keeping.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

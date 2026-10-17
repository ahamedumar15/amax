import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@amax/ui/styles/index.css";
import { ThemeScript } from "../components/shell/ThemeScript";

export const metadata: Metadata = { title: { default: "amax", template: "%s · amax" }, description: "Agent-native ERP for software and professional-services companies" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}

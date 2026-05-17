import type { Metadata } from "next";
import "./../styles/globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { I18nProvider } from "@/lib/i18n/provider";

export const metadata: Metadata = {
  title: "TeamMamba — Project & Task Management",
  description: "The fast, powerful project management platform that teams actually enjoy using.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TeamMamba",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6c5ce7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider><I18nProvider>{children}</I18nProvider></ThemeProvider>
        <OfflineIndicator />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Приёмка склада",
  description: "Проверка накладных и товарных строк",
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Приёмка', statusBarStyle: 'default' },
  icons: {
    apple: '/icon-180.png',
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head><meta name="theme-color" content="#eef2f1" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" /></head>
      <body>{children}</body>
    </html>
  );
}

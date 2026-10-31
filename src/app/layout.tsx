import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Белая Тишина: Топка — полярная инкременталка",
  description:
    "1917 год, полярная ночь. Руби дрова, разжигай топку, разворачивай индустрию тепла — от щепки до 1e100. Автор: DirtyG.",
  keywords: ["инкременталка", "idle", "кликер", "полярная ночь", "1917"],
  authors: [{ name: "DirtyG" }],
};

export const viewport: Viewport = {
  themeColor: "#060b1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased night-bg text-slate-100 min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

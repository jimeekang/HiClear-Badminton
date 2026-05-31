import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import PwaRegistrar from "@/components/PwaRegistrar";

export const metadata: Metadata = {
  title: "HiClear Badminton Court",
  description: "배드민턴 클럽 코트 로테이션 앱",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HiClear",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-white text-gray-900 min-h-screen">
        <PwaRegistrar />
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}

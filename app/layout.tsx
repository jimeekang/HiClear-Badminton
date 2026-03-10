import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "HiClear Badminton",
  description: "배드민턴 클럽 코트 로테이션 앱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-white text-gray-900 min-h-screen">
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}

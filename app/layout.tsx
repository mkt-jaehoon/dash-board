import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "데일리 성과 대시보드",
  description: "광고 성과와 운영 코멘트를 한 화면에서 확인하는 대시보드",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-950 text-gray-100">{children}</body>
    </html>
  );
}

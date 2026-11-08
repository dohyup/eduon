import {connection} from "next/server";
import "./globals.css";
import { isDemoMode } from "@/server/config";
import { PublicHeader, Footer } from "@/components/layout/public-header";
export const metadata = {
  title: { default: "EDUON · 배움이음터", template: "%s | EDUON" },
  description:
    "우리 아이에게 맞는 수업, 믿을 수 있는 학원에서. 학원의 가능성과 아이의 배움을 잇는 배움이음터.",
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          본문으로 건너뛰기
        </a>
        <PublicHeader demo={isDemoMode()} />
        {children}
        <Footer demo={isDemoMode()} />
      </body>
    </html>
  );
}

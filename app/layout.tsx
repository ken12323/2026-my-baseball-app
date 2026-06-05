import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// 🌟 作成したHeaderコンポーネントを読み込む
import Header from "@/components/Header"; 

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 🌟 ブラウザのタブに表示されるタイトルと説明文を変更
export const metadata: Metadata = {
  title: "BASEBALL ROOTS | プロ野球データ分析",
  description: "あらゆる「ルーツ」からプロ野球選手の現在地を比較・分析するサイト",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja" // 🌟 英語(en)から日本語(ja)に変更
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 🌟 ページの一番上に共通ヘッダーを配置 */}
        <Header />
        
        {/* 🌟 各ページのコンテンツ（children）をmainタグで囲む（レイアウト安定のため） */}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
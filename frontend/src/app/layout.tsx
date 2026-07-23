import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";
import LoadingGate from "@/components/LoadingGate";
import LenisProvider from "@/components/LenisProvider";
import Scene from "@/components/Scene";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
});

export const metadata: Metadata = {
  title: "KEYCODE — Digital Creation Studio",
  description: "Award-winning digital creation platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${syne.variable}`}>
      <body>
        <Scene />
        <LoadingGate>
          <LenisProvider>{children}</LenisProvider>
        </LoadingGate>
      </body>
    </html>
  );
}

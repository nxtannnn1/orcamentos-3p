import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AppHeader } from "../components/app-header";

// A sessão deve ser avaliada em cada requisição, inclusive quando os secrets
// são injetados apenas no ambiente de execução após o build.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema 3P | Validação de orçamentos",
  description: "Interface operacional para revisão humana de materiais.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={geistSans.variable}>
      <body><AppHeader />{children}</body>
    </html>
  );
}

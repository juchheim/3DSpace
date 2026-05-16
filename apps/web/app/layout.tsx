import type { Metadata } from "next";
import { AppAuthProvider } from "../lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "3DSpace",
  description: "Browser-based immersive classroom MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppAuthProvider>{children}</AppAuthProvider>
      </body>
    </html>
  );
}

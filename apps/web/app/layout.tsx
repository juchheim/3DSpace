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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppAuthProvider>{children}</AppAuthProvider>
      </body>
    </html>
  );
}

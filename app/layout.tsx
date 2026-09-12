import './campaign.css';
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THOR RV Studio",
  description: "Create RV marketing photography with reusable landscapes and carefully directed AI edits.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../styles/globals.css";
import Providers from "./providers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Separator } from "@base-ui/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Chat app",
  description: "AI Chat application with model selection, streaming",
  openGraph: {
    title: "AI Chat app",
    description: "AI Chat application with model selection, streaming",
    // images: "",
    // url: "",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-screen flex flex-col">
        <Providers>
          <AppSidebar />

          <SidebarInset className="flex flex-col flex-1 min-w-0">
            <AppHeader />

            <Separator />

            <div className="flex-1 min-h-0 max-w-5xl w-full mx-auto p-4">
              {children}
            </div>
          </SidebarInset>
        </Providers>
      </body>
    </html>
  );
}

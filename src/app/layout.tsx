import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aloud",
  description: "An AI tutor that talks a student through the essay they just wrote.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body>
        <SiteHeader />
        {children}
        <footer className="footer">
          <div className="footer-inner">
            Aloud &mdash; the student is never accused of anything; you decide what a pattern
            means. Results are visible only to the teacher who set them up.
          </div>
        </footer>
      </body>
    </html>
  );
}

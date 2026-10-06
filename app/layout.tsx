import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Вільні паркувальні місця у Львові",
  description: "Моніторинг вільних паркувальних місць у Львові на карті в реальному часі.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";
import "./detail.css";
import "./filters.css";

export const metadata = { title: "Signal Grid — MEXC UT Bot Scanner", description: "Six-timeframe MEXC UT Bot K2 ATR10 alignment scanner and research platform." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

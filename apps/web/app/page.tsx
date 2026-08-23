import Link from "next/link";
import { getScannerRows } from "../lib/db";
import ScannerDashboard from "./components/scanner-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const rows = await getScannerRows();
  const updatedAt = rows[0]?.updatedAt ?? new Date().toISOString();
  return <main>
    <header className="topbar">
      <Link href="/" className="brand"><span className="brand-mark">UT</span><span>Signal Grid</span></Link>
      <nav aria-label="Primary navigation"><Link className="active" href="/">Scanner</Link><Link href="/alignment">Alignment</Link><Link href="/analytics">Analytics</Link></nav>
      <div className="system-status"><span className="status-dot" /> MEXC feed active</div>
    </header>
    <section className="page-shell">
      <div className="page-heading">
        <div><div className="eyebrow">K 2 · ATR 10 · COMPLETED CANDLES</div><h1>Multi-timeframe market scanner</h1><p>Find MEXC markets where UT Bot direction converges across six timeframes.</p></div>
        <div className="updated">Last scan <strong>{new Date(updatedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</strong></div>
      </div>
      <ScannerDashboard initialRows={rows} />
    </section>
  </main>;
}

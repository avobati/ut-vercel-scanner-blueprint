"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScannerRow, Timeframe } from "../../lib/scanner";

const tfs: Timeframe[] = ["1H", "4H", "6H", "12H", "1D", "1W"];
function money(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value < .01) return `$${value.toPrecision(3)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

export default function ScannerDashboard({ initialRows }: { initialRows: ScannerRow[] }) {
  const [search, setSearch] = useState(""); const [market, setMarket] = useState("ALL");
  const [alignment, setAlignment] = useState("ALL"); const [live, setLive] = useState(false);
  const rows = useMemo(() => initialRows.filter((row) => {
    if (search && !row.symbol.includes(search.toUpperCase())) return false;
    if (market !== "ALL" && row.market !== market) return false;
    if (alignment === "BUY" && row.buyCount < 5) return false;
    if (alignment === "SELL" && row.sellCount < 5) return false;
    if (alignment === "FULL" && Math.max(row.buyCount, row.sellCount) !== 6) return false;
    return true;
  }), [initialRows, search, market, alignment]);
  const fullBuy = initialRows.filter((r) => r.buyCount === 6).length;
  const fullSell = initialRows.filter((r) => r.sellCount === 6).length;
  const fresh = initialRows.filter((r) => r.isNewAlignment).length;
  return <>
    <section className="metrics"><article><span>Markets scanned</span><strong>{initialRows.length.toLocaleString()}</strong><small>Spot + perpetuals</small></article><article className="positive"><span>Full buy alignment</span><strong>{fullBuy}</strong><small>6 of 6 timeframes</small></article><article className="negative"><span>Full sell alignment</span><strong>{fullSell}</strong><small>6 of 6 timeframes</small></article><article className="accent"><span>New alignments</span><strong>{fresh}</strong><small>Detected in last 24h</small></article></section>
    <section className="scanner-panel">
      <div className="toolbar"><label className="search"><span>⌕</span><input aria-label="Search symbol" placeholder="Search BTCUSDT…" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select aria-label="Market type" value={market} onChange={(e) => setMarket(e.target.value)}><option value="ALL">All markets</option><option value="SPOT">Spot</option><option value="PERP">Perpetuals</option></select><select aria-label="Alignment filter" value={alignment} onChange={(e) => setAlignment(e.target.value)}><option value="ALL">Any alignment</option><option value="FULL">Full 6/6</option><option value="BUY">5+ BUY</option><option value="SELL">5+ SELL</option></select><label className="toggle"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /><span /> Include live candle</label><div className="row-count">{rows.length} results</div></div>
      {live && <div className="live-warning">Live candle mode is provisional and may change before the candle closes.</div>}
      <div className="table-scroll"><table className="scanner-table"><thead><tr><th>Market</th><th className="number">Price</th>{tfs.map((tf) => <th key={tf}>{tf}</th>)}<th>Alignment</th><th>Weighted</th><th>Last change</th></tr></thead><tbody>{rows.map((row) => {
        const direction = row.buyCount > row.sellCount ? "BUY" : row.sellCount > row.buyCount ? "SELL" : "MIXED"; const count = Math.max(row.buyCount, row.sellCount);
        return <tr key={`${row.symbol}-${row.market}`} className={count === 6 ? `full ${direction.toLowerCase()}` : ""}><td><Link href={`/markets/${row.symbol}`} className="symbol"><span className="coin">{row.base.slice(0, 2)}</span><span><strong>{row.symbol}</strong><small>{row.market === "PERP" ? "USDT Perpetual" : "MEXC Spot"}</small></span></Link></td><td className="number"><strong>{money(row.price)}</strong><small className={row.change24h >= 0 ? "up" : "down"}>{row.change24h >= 0 ? "+" : ""}{row.change24h.toFixed(2)}%</small></td>{tfs.map((tf) => { const signal = row.signals[tf]; return <td key={tf}>{signal ? <><span className={`signal ${signal.direction.toLowerCase()}`}>{signal.direction}</span><small>{signal.age} ago</small></> : <span className="signal-missing">WAIT</span>}</td>; })}<td><span className={`alignment ${direction.toLowerCase()}`}>{count}/6 {direction}</span>{row.isNewAlignment && <small className="new-label">NEW ALIGNMENT</small>}</td><td><strong>{Math.max(row.buyWeighted, row.sellWeighted)}/18</strong><small>{direction} weight</small></td><td><strong>{row.lastChange}</strong><small>Volume {money(row.volume24h)}</small></td></tr>;
      })}</tbody></table></div>
    </section>
  </>;
}

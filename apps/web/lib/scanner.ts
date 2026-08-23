export type Timeframe = "1H" | "4H" | "6H" | "12H" | "1D" | "1W";
export type Direction = "BUY" | "SELL";
export type ScannerRow = { symbol: string; base: string; quote: string; market: "SPOT" | "PERP"; price: number; change24h: number; volume24h: number; signals: Record<Timeframe, { direction: Direction; age: string; barsAgo: number }>; buyCount: number; sellCount: number; buyWeighted: number; sellWeighted: number; lastChange: string; isNewAlignment: boolean; updatedAt: string };
const weights: Record<Timeframe, number> = { "1H": 1, "4H": 2, "6H": 2, "12H": 3, "1D": 4, "1W": 6 };
export function scoreSignals(signals: ScannerRow["signals"]) {
  return (Object.entries(signals) as [Timeframe, { direction: Direction }][]).reduce((out, [tf, s]) => { out[s.direction === "BUY" ? "buyCount" : "sellCount"]++; out[s.direction === "BUY" ? "buyWeighted" : "sellWeighted"] += weights[tf]; return out; }, { buyCount: 0, sellCount: 0, buyWeighted: 0, sellWeighted: 0 });
}

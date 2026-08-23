import { Pool } from "pg";
import universe from "../data/universe.json";
import symbolMeta from "../data/symbol_meta.json";
import manualBackfill from "../data/manual_backfill.json";
import { scoreSignals, type ScannerRow, type Timeframe } from "./scanner";

type SignalRow = {
  symbol: string;
  symbol_name: string;
  market: string;
  timeframe: string;
  signal: string;
  price: string | number | null;
  signal_price: string | number | null;
  bars_ago: number | null;
  ts: string;
  data_quality: "complete" | "inferred" | "missing";
};

type BaseSignalRow = Omit<SignalRow, "symbol_name" | "market" | "data_quality">;
type UniverseFile = { symbols?: string[] };
type MetaEntry = { name?: string; market?: string };
type BackfillEntry = {
  timeframe?: string;
  signal?: string;
  price?: string | number | null;
  signal_price?: string | number | null;
  bars_ago?: number | null;
};

const rawDatabaseUrl = (process.env.DATABASE_URL || "").trim();
const hasPlaceholderDbUrl = /user:pass@host/.test(rawDatabaseUrl);
const useNoDbMode = !rawDatabaseUrl || hasPlaceholderDbUrl;
const pool = useNoDbMode ? null : new Pool({ connectionString: rawDatabaseUrl, allowExitOnIdle: true });

const meta = symbolMeta as Record<string, MetaEntry>;
const backfill = manualBackfill as Record<string, BackfillEntry>;

function metaFor(symbol: string): { symbol_name: string; market: string } {
  const entry = meta[symbol] || {};
  const market = entry.market || (symbol.includes(":") ? symbol.split(":", 1)[0] : "UNKNOWN");
  const fallbackName = symbol.includes(":") ? symbol.split(":", 2)[1] : symbol;
  return {
    symbol_name: entry.name || fallbackName,
    market,
  };
}

function loadUniverse(): string[] {
  const parsed = universe as UniverseFile;
  const symbols = Array.isArray(parsed.symbols) ? parsed.symbols : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const s of symbols) {
    const tv = String(s || "").trim().toUpperCase();
    if (!tv || tv.includes("SPARE")) continue;
    if (seen.has(tv)) continue;
    seen.add(tv);
    out.push(tv);
  }

  return out;
}

function toFiniteNumber(v: string | number | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function timeframeDays(tf: string): number {
  const t = String(tf || "").trim().toLowerCase();
  if (t === "daily") return 1;
  if (t === "monthly") return 30;
  return 7;
}

function inferMissingFields(row: BaseSignalRow, allowBarsFromTs: boolean): BaseSignalRow {
  let price = toFiniteNumber(row.price);
  let signalPrice = toFiniteNumber(row.signal_price);
  let barsAgo = row.bars_ago;

  if (price == null && signalPrice != null) price = signalPrice;
  if (signalPrice == null && price != null) signalPrice = price;

  if ((barsAgo == null || barsAgo < 0) && allowBarsFromTs) {
    const tsMs = Date.parse(row.ts);
    if (Number.isFinite(tsMs) && tsMs > Date.parse("2000-01-01T00:00:00.000Z")) {
      const ageDays = Math.max(0, (Date.now() - tsMs) / 86400000);
      barsAgo = Math.round(ageDays / timeframeDays(row.timeframe));
    }
  }

  return {
    ...row,
    price,
    signal_price: signalPrice,
    bars_ago: barsAgo ?? null,
  };
}

function classifyDataQuality(before: BaseSignalRow, after: BaseSignalRow): "complete" | "inferred" | "missing" {
  const beforeComplete = before.price != null && before.signal_price != null && before.bars_ago != null;
  const afterComplete = after.price != null && after.signal_price != null && after.bars_ago != null;
  if (beforeComplete) return "complete";
  if (afterComplete) return "inferred";
  return "missing";
}

function applyBackfill(symbol: string, timeframe: string, row: BaseSignalRow): BaseSignalRow {
  const b = backfill[symbol];
  if (!b) return row;
  if ((b.timeframe || timeframe).toLowerCase() !== row.timeframe.toLowerCase()) return row;

  const needsBackfill = row.price == null || row.signal_price == null || row.bars_ago == null;
  if (!needsBackfill) return row;

  return {
    ...row,
    signal: row.signal || b.signal || "NEUTRAL",
    price: row.price ?? b.price ?? null,
    signal_price: row.signal_price ?? b.signal_price ?? null,
    bars_ago: row.bars_ago ?? b.bars_ago ?? null,
  };
}

function backfillOnly(symbol: string, timeframe: string): BaseSignalRow {
  const b = backfill[symbol];
  if (!b || (b.timeframe || timeframe).toLowerCase() !== timeframe.toLowerCase()) {
    return {
      symbol,
      timeframe,
      signal: "NEUTRAL",
      price: null,
      signal_price: null,
      bars_ago: null,
      ts: new Date(0).toISOString(),
    };
  }

  return {
    symbol,
    timeframe,
    signal: b.signal || "NEUTRAL",
    price: b.price ?? null,
    signal_price: b.signal_price ?? null,
    bars_ago: b.bars_ago ?? null,
    ts: new Date(0).toISOString(),
  };
}

export async function getLatestSignals(limit = 10000, timeframe = "weekly"): Promise<SignalRow[]> {
  const universeSymbols = loadUniverse();
  const cap = Math.max(1, limit);

  if (!pool) {
    return universeSymbols.slice(0, cap).map((symbol) => {
      const m = metaFor(symbol);
      const raw = backfillOnly(symbol, timeframe);
      const inferred = inferMissingFields(raw, false);
      return {
        ...inferred,
        data_quality: classifyDataQuality(raw, inferred),
        ...m,
      };
    });
  }

  const sql = `
    select distinct on (s.symbol, s.timeframe)
      s.symbol, s.timeframe, s.signal, s.price, s.signal_price, s.bars_ago, s.ts
    from signals s
    where s.timeframe = $1
    order by s.symbol, s.timeframe, s.ts desc
  `;

  const { rows } = await pool.query(sql, [timeframe]);
  const latest = new Map<string, BaseSignalRow>();
  for (const r of rows as BaseSignalRow[]) {
    latest.set(String(r.symbol).toUpperCase(), r);
  }

  return universeSymbols.slice(0, cap).map((symbol) => {
    const m = metaFor(symbol);
    const row = latest.get(symbol);
    const raw = row ? applyBackfill(symbol, timeframe, row) : backfillOnly(symbol, timeframe);
    const inferred = inferMissingFields(raw, Boolean(row));
    return {
      ...inferred,
      data_quality: classifyDataQuality(raw, inferred),
      ...m,
    };
  });
}

const demo: Array<[string, ScannerRow["market"], number, number, number, string, boolean]> = [
  ["BTCUSDT", "SPOT", 115420, 2.84, 4.8e9, "BBBBBB", true], ["ETHUSDT", "SPOT", 4862.4, 1.92, 2.1e9, "BBBBBS", false],
  ["TAOUSDT", "PERP", 368.21, 5.74, 184e6, "BBBBBB", true], ["SOLUSDT", "PERP", 241.08, -1.14, 912e6, "SSSSSS", false],
  ["XRPUSDT", "SPOT", 3.084, -2.31, 742e6, "SSSSSB", true], ["LINKUSDT", "PERP", 27.62, 3.18, 224e6, "BBBBSS", false],
  ["AAVEUSDT", "SPOT", 329.44, 0.72, 97e6, "BBBBBS", false], ["SUIUSDT", "PERP", 4.188, -4.08, 318e6, "SSSSSS", true],
  ["ENAUSDT", "SPOT", .8241, 6.31, 143e6, "BBBSSS", false], ["DOGEUSDT", "SPOT", .2384, -0.83, 522e6, "SSSSBS", false],
];

function demoRows(): ScannerRow[] {
  const tfs: Timeframe[] = ["1H", "4H", "6H", "12H", "1D", "1W"];
  const ages = ["2h", "8h", "12h", "1d", "4d", "2w"];
  return demo.map(([symbol, market, price, change24h, volume24h, pattern, isNewAlignment], rowIndex) => {
    const signals = Object.fromEntries(tfs.map((tf, i) => [tf, { direction: pattern[i] === "B" ? "BUY" : "SELL", age: ages[(i + rowIndex) % ages.length], barsAgo: (i + rowIndex) % 7 + 1 }])) as ScannerRow["signals"];
    return { symbol, base: symbol.replace(/USDT$/, ""), quote: "USDT", market, price, change24h, volume24h, signals, ...scoreSignals(signals), lastChange: rowIndex % 2 ? `${rowIndex + 1}h ago` : "42m ago", isNewAlignment, updatedAt: new Date().toISOString() };
  });
}

export async function getScannerRows(): Promise<ScannerRow[]> {
  if (!pool) return demoRows();
  try {
    const { rows } = await pool.query(`select symbol, base_asset, quote_asset, market_type, price, change_24h, volume_24h, updated_at,
      jsonb_object_agg(timeframe, jsonb_build_object('direction', direction, 'barsAgo', bars_ago, 'age', age_label)) as signals,
      max(case when is_new_alignment then 1 else 0 end) as is_new_alignment
      from scanner_latest group by symbol, base_asset, quote_asset, market_type, price, change_24h, volume_24h, updated_at order by volume_24h desc limit 2500`);
    if (!rows.length) return demoRows();
    return rows.map((r) => { const signals = r.signals as ScannerRow["signals"]; return { symbol: r.symbol, base: r.base_asset, quote: r.quote_asset, market: r.market_type, price: Number(r.price), change24h: Number(r.change_24h), volume24h: Number(r.volume_24h), signals, ...scoreSignals(signals), lastChange: "recently", isNewAlignment: Boolean(Number(r.is_new_alignment)), updatedAt: r.updated_at }; });
  } catch { return demoRows(); }
}

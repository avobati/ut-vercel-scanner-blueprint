export function trueRange(candles) {
  return candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
}

export function wilderAtr(candles, period = 10) {
  const tr = trueRange(candles); const atr = Array(tr.length).fill(null);
  if (tr.length < period) return atr;
  atr[period - 1] = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
  return atr;
}

export function calculateUtBot(candles, key = 2, period = 10) {
  if (candles.length < period + 2) throw new Error(`UT Bot needs at least ${period + 2} candles`);
  const atr = wilderAtr(candles, period); const stops = Array(candles.length).fill(null); const signals = Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    const src = candles[i].close; const prevSrc = i ? candles[i - 1].close : src; const loss = key * atr[i]; const prev = stops[i - 1] ?? src;
    if (src > prev && prevSrc > prev) stops[i] = Math.max(prev, src - loss);
    else if (src < prev && prevSrc < prev) stops[i] = Math.min(prev, src + loss);
    else stops[i] = src > prev ? src - loss : src + loss;
    if (i > period - 1 && prevSrc <= prev && src > stops[i]) signals[i] = "BUY";
    else if (i > period - 1 && prevSrc >= prev && src < stops[i]) signals[i] = "SELL";
  }
  let direction = "SELL", lastSignalIndex = period - 1;
  for (let i = period; i < signals.length; i++) if (signals[i]) { direction = signals[i]; lastSignalIndex = i; }
  return { direction, barsAgo: candles.length - 1 - lastSignalIndex, stop: stops.at(-1), signals, stops };
}

export function aggregateCandles(hourly, hours) {
  const bucketMs = hours * 3600000; const buckets = new Map();
  for (const c of hourly) { const openTime = Math.floor(c.openTime / bucketMs) * bucketMs; const b = buckets.get(openTime); if (!b) buckets.set(openTime, { ...c, openTime }); else { b.high = Math.max(b.high, c.high); b.low = Math.min(b.low, c.low); b.close = c.close; b.volume += c.volume; b.closeTime = c.closeTime; } }
  return [...buckets.values()].sort((a, b) => a.openTime - b.openTime);
}

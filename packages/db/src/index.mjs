import pg from "pg";

const { Pool } = pg;
const rawDatabaseUrl = (process.env.DATABASE_URL || "").trim();
const allowNoDb = process.env.ALLOW_NO_DB === "1";
const hasPlaceholderDbUrl = /user:pass@host/.test(rawDatabaseUrl);
const useNoDbMode = allowNoDb || !rawDatabaseUrl || hasPlaceholderDbUrl;

let pool = null;
if (!useNoDbMode) {
  pool = new Pool({ connectionString: rawDatabaseUrl, allowExitOnIdle: true });
}

async function query(sql, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured for live writes");
  }
  return pool.query(sql, params);
}

export async function beginRun(groupId, timeframe) {
  if (useNoDbMode) {
    return { id: Date.now(), started_at: new Date().toISOString() };
  }

  const sql = `
    insert into scan_runs(group_id, timeframe, status)
    values ($1, $2, 'running')
    returning id, started_at
  `;
  const { rows } = await query(sql, [groupId, timeframe]);
  return rows[0];
}

export async function finishRun(runId, status, error) {
  if (useNoDbMode) {
    return;
  }

  const sql = `
    update scan_runs
    set status = $2, error = $3, finished_at = now()
    where id = $1
  `;
  await query(sql, [runId, status, error]);
}

export async function upsertSignal({ symbol, timeframe, signal, price, signalPrice, barsAgo, ts, runId }) {
  if (useNoDbMode) {
    return;
  }

  const sql = `
    insert into signals(symbol, timeframe, signal, price, signal_price, bars_ago, ts, run_id)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (symbol, timeframe, ts)
    do update set
      signal = excluded.signal,
      price = excluded.price,
      signal_price = excluded.signal_price,
      bars_ago = excluded.bars_ago,
      run_id = excluded.run_id
  `;
  await query(sql, [symbol, timeframe, signal, price, signalPrice, barsAgo, ts, runId]);
}

export async function getLatestSignals(limit = 100) {
  if (useNoDbMode) {
    return [];
  }

  const sql = `
    select s.symbol, s.timeframe, s.signal, s.price, s.signal_price, s.bars_ago, s.ts
    from signals s
    join (
      select symbol, timeframe, max(ts) as max_ts
      from signals
      group by symbol, timeframe
    ) latest
      on s.symbol = latest.symbol
     and s.timeframe = latest.timeframe
     and s.ts = latest.max_ts
    order by s.ts desc
    limit $1
  `;
  const { rows } = await query(sql, [limit]);
  return rows;
}

export async function startScannerRun(shard) { const {rows}=await query("insert into scan_runs(shard,status) values($1,'running') returning id",[shard]); return rows[0]; }
export async function completeScannerRun(id,count,error=null) { await query("update scan_runs set status=$2,symbols_scanned=$3,error=$4,finished_at=now() where id=$1",[id,error?"failed":"success",count,error]); }
export async function upsertMarket(m) { const {rows}=await query(`insert into markets(symbol,base_asset,quote_asset,market_type,price,change_24h,volume_24h) values($1,$2,$3,$4,$5,$6,$7) on conflict(symbol,market_type) do update set base_asset=excluded.base_asset,quote_asset=excluded.quote_asset,price=excluded.price,change_24h=excluded.change_24h,volume_24h=excluded.volume_24h,active=true,updated_at=now() returning id`,[m.symbol,m.base,m.quote,m.market,Number(m.ticker?.lastPrice||0),Number(m.ticker?.priceChangePercent||0),Number(m.ticker?.quoteVolume||0)]); return rows[0].id; }
export async function latestDirections(marketId) { const {rows}=await query("select distinct on(timeframe) timeframe,direction from ut_signals where market_id=$1 order by timeframe,candle_close_at desc",[marketId]); return Object.fromEntries(rows.map(r=>[r.timeframe,r.direction])); }
export async function saveUtSignal(s) { await query(`insert into ut_signals(market_id,timeframe,direction,bars_ago,signal_at,candle_close_at,price,trailing_stop,run_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(market_id,timeframe,candle_close_at) do update set direction=excluded.direction,bars_ago=excluded.bars_ago,price=excluded.price,trailing_stop=excluded.trailing_stop,run_id=excluded.run_id`,[s.marketId,s.timeframe,s.direction,s.barsAgo,s.signalAt,s.candleCloseAt,s.price,s.stop,s.runId]); }
export async function saveAlignmentEvent(e) { await query(`insert into alignment_events(market_id,direction,previous_count,new_count,trigger_timeframe,entry_price) select $1,$2,$3,$4,$5,$6 where not exists(select 1 from alignment_events where market_id=$1 and direction=$2 and detected_at>now()-interval '1 hour')`,[e.marketId,e.direction,e.previousCount,e.newCount,e.trigger,e.price]); }

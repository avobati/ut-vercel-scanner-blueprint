import { calculateUtBot, aggregateCandles } from "../../../packages/core/src/utbot.mjs";
import { discoverMarkets, spotCandles, perpCandles } from "./mexc.mjs";
import { startScannerRun, completeScannerRun, upsertMarket, latestDirections, saveUtSignal, saveAlignmentEvent } from "db";

const shard = Number(process.env.SCAN_SHARD || process.argv[process.argv.indexOf("--shard") + 1] || 0);
const shardCount = Number(process.env.SCAN_SHARDS || 24); const TIMEFRAMES=["1H","4H","6H","12H","1D","1W"];
const interval={"1H":"1h","4H":"4h","1D":"1d","1W":"1w"};
function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h}
function completed(c){return c.filter(x=>x.closeTime<Date.now())}
async function candles(m,tf){if(tf==="6H"||tf==="12H"){const h=m.market==="SPOT"?await spotCandles(m.symbol,"1h",1000):await perpCandles(m.apiSymbol,"Min60",1000);return aggregateCandles(completed(h),tf==="6H"?6:12)}if(m.market==="SPOT")return completed(await spotCandles(m.symbol,interval[tf],300));const map={"1H":"Min60","4H":"Hour4","1D":"Day1","1W":"Week1"};return completed(await perpCandles(m.apiSymbol,map[tf],300))}
const run=await startScannerRun(shard);let count=0;
try{const markets=(await discoverMarkets()).filter(m=>hash(`${m.market}:${m.symbol}`)%shardCount===shard);for(const m of markets){try{const marketId=await upsertMarket(m);const before=await latestDirections(marketId);const now={};for(const tf of TIMEFRAMES){const cs=await candles(m,tf);const result=calculateUtBot(cs,2,10);const last=cs.at(-1);now[tf]=result.direction;await saveUtSignal({marketId,timeframe:tf,...result,signalAt:new Date(cs[Math.max(0,cs.length-1-result.barsAgo)].closeTime),candleCloseAt:new Date(last.closeTime),price:last.close,runId:run.id})}for(const direction of ["BUY","SELL"]){const previousCount=Object.values(before).filter(x=>x===direction).length;const newCount=Object.values(now).filter(x=>x===direction).length;if(previousCount<6&&newCount===6){const trigger=TIMEFRAMES.find(tf=>before[tf]!==direction);await saveAlignmentEvent({marketId,direction,previousCount,newCount,trigger,price:Number(m.ticker?.lastPrice||0)})}}count++}catch(e){console.error(`scan ${m.market}:${m.symbol}: ${e.message}`)}}await completeScannerRun(run.id,count)}catch(e){await completeScannerRun(run.id,count,String(e));throw e}
console.log(`MEXC shard ${shard}/${shardCount}: ${count} markets scanned`);

import test from "node:test"; import assert from "node:assert/strict";
import { aggregateCandles, calculateUtBot, wilderAtr } from "./utbot.mjs";
test("Wilder ATR seeds with the arithmetic mean", () => { const c = Array.from({length:12},(_,i)=>({open:i,high:i+2,low:i,close:i+1})); assert.equal(wilderAtr(c,10)[9],2); });
test("UT Bot is deterministic and never mutates closed signals", () => { const c = Array.from({length:60},(_,i)=>({open:i,high:102+i*.4,low:98+i*.4,close:100+i*.4+(i>35?-(i-35)*1.2:0)})); const a=calculateUtBot(c); const b=calculateUtBot([...c,{open:1,high:90,low:80,close:82}]); assert.deepEqual(a.signals,b.signals.slice(0,-1)); });
test("6H aggregation uses fixed UTC boundaries", () => { const h=Array.from({length:12},(_,i)=>({openTime:i*3600000,closeTime:(i+1)*3600000-1,open:i,high:i+2,low:i-1,close:i+1,volume:1})); const out=aggregateCandles(h,6); assert.equal(out.length,2); assert.equal(out[1].openTime,21600000); assert.equal(out[0].volume,6); });

import test from "node:test";
import assert from "node:assert/strict";
import { collectRegister } from "../src/lib/register-export.ts";
import { registerQuery, registerPage, filterDate, registerTerm, EMPTY_UNIT_ID } from "../src/lib/asset-query.ts";
test("full export spans multiple batches beyond the screen and server limits", async () => {
 const source=Array.from({length:1205},(_,i)=>({id:String(i)})), offsets=[];
 const rows=await collectRegister(async offset=>{offsets.push(offset);return {assets:source.slice(offset,offset+500),total:source.length};});
 assert.deepEqual(rows,source);assert.deepEqual(offsets,[0,500,1000]);
});
test("unconfirmed or changing exports never produce a partial successful file",async()=>{
 for(const kind of ["empty","count","duplicate","network"]){
  let calls=0;
  await assert.rejects(collectRegister(async()=>{calls++;if(calls===1)return {assets:[{id:"a"}],total:2};if(kind==="network")throw new Error("offline");return {assets:kind==="duplicate"?[{id:"a"}]:[],total:kind==="count"?3:2};}));
 }
 assert.deepEqual(await collectRegister(async()=>({assets:[],total:0})),[]);
});
test("filters use exact counts, fail-closed empty scope and stable ID tie breaking",()=>{
 const calls=[],query=new Proxy({}, {get:(_,method)=>(...args)=>{calls.push([method,...args]);return query;}}), client={from:()=>query};
 registerQuery(client,"*",{unitIds:[],category:null,condition:null,from:"2026-10-12",to:"2026-10-12",term:"chair",sort:"name"}).range(100,199);
 assert.deepEqual(calls[0],["select","*",{count:"exact"}]);
 assert.deepEqual(calls[1],["in","org_unit_id",[EMPTY_UNIT_ID]]);
 assert.deepEqual(calls.at(-2),["order","id",{ascending:true}]);
 assert.deepEqual(calls.at(-1),["range",100,199]);
 assert.equal(calls.find(c=>c[0]==="lte")[2],"2026-10-12T23:59:59.999999Z");
});
test("malformed pages and dates are normalized; search cannot inject filter syntax",()=>{
 for(const value of ["0","-3","1.5","NaN","Infinity"] )assert.equal(registerPage(value),1);
 assert.equal(registerPage("2"),2);assert.equal(filterDate("2026-02-29"),null);assert.equal(filterDate("2024-02-29"),"2024-02-29");
 assert.equal(/[%,().\\"']/.test(registerTerm(`a%,(b)."c'`)),false);
});

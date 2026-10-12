import assert from "node:assert/strict";
import test from "node:test";
import { parseAccountInput, provisionAccount } from "../src/lib/account-provisioning.ts";

const unit = "11111111-1111-4111-8111-111111111111";
const valid = { name: "Officer", email: "officer@example.invalid", password: "eight-chars", role: "staff", unit_ids: [unit] };

test("account input validates runtime types, privileges, units and normalizes valid data", () => {
  const parsed = parseAccountInput({ ...valid, name: " Officer ", email: " OFFICER@example.invalid ", unit_ids: [unit,unit] });
  assert.equal(parsed.email,"officer@example.invalid");
  assert.deepEqual(parsed.unit_ids,[unit]);
  for (const body of [null, [], {...valid,name:3}, {...valid,email:[]}, {...valid,role:"root"}, {...valid,unit_ids:[]},
    {...valid,password:12345678}, {...valid,invite:"true"}, {...valid,unit_ids:["bad"]}, {...valid,campus_id:"bad"}]) {
    assert.throws(()=>parseAccountInput(body));
  }
  assert.equal(parseAccountInput({...valid,invite:true,password:undefined}).invite,true);
  assert.deepEqual(parseAccountInput({...valid,role:"admin",unit_ids:[]}).unit_ids,[]);
});

test("a failed new password-account setup is compensated by deleting only its new ID", async () => {
  const removed=[];
  const result=await provisionAccount(false,{create:async()=>"new-id",provision:async()=>{throw Error("unit failure");},remove:async id=>{removed.push(id);}});
  assert.equal(result.ok,false);
  assert.deepEqual(removed,["new-id"]);
  assert.match(result.error,/rolled back/);
});

test("invitation setup failure retains the recipient and returns explicit recovery", async () => {
  let removed=false;
  const result=await provisionAccount(true,{create:async()=>"invited-id",provision:async()=>{throw Error("unit failure");},remove:async()=>{removed=true;}});
  assert.equal(removed,false);
  assert.equal(result.incompleteUserId,"invited-id");
});

test("failed cleanup reports the surviving account rather than a false rollback", async () => {
  const result=await provisionAccount(false,{create:async()=>"new-id",provision:async()=>{throw Error("unit failure");},remove:async()=>{throw Error("cleanup failure");}});
  assert.equal(result.incompleteUserId,"new-id");
  assert.doesNotMatch(result.error,/rolled back/);
});

test("auth creation refusal never attempts provisioning or cleanup", async () => {
  const calls=[];
  await assert.rejects(provisionAccount(false,{create:async()=>{throw Error("duplicate email");},provision:async()=>{calls.push("provision");},remove:async()=>{calls.push("remove");}}),/duplicate/);
  assert.deepEqual(calls,[]);
});

test("auditors keep assigned read scope and cannot be created without units",()=>{
 const account=parseAccountInput({...valid,role:"auditor"});
 assert.equal(account.role,"auditor");assert.deepEqual(account.unit_ids,[unit]);
 assert.throws(()=>parseAccountInput({...valid,role:"auditor",unit_ids:[]}));
});

import test from "node:test";
import assert from "node:assert/strict";
import { photoObjectKey, signedAssetPhoto, signedAssetPhotos } from "../src/lib/asset-photo.ts";
const project="https://example.supabase.co";
test("photos accept stored keys and the same-project legacy public URL only",()=>{
 assert.equal(photoObjectKey("abc.jpg",project),"abc.jpg");
 assert.equal(photoObjectKey(`${project}/storage/v1/object/public/asset-photos/a%20b.jpg`,project),"a b.jpg");
 for(const ref of ["https://tracker.invalid/a.jpg",`${project}/storage/v1/object/sign/asset-photos/a.jpg?token=x`,"../a.jpg","/a.jpg","a/../b.jpg","a\\b.jpg","javascript:x","a.jpg?token=x"])assert.equal(photoObjectKey(ref,project),null);
});
test("signed photo access uses the caller's storage permissions and expires after 15 minutes",async()=>{
 const calls=[],client={storage:{from(bucket){assert.equal(bucket,"asset-photos");return {async createSignedUrl(key,expires){calls.push([key,expires]);return {data:{signedUrl:"https://private/photo"},error:null};}};}}};
 assert.equal(await signedAssetPhoto(client,"a.jpg",project),"https://private/photo");assert.deepEqual(calls,[["a.jpg",900]]);
 assert.equal(await signedAssetPhoto(client,"https://tracker.invalid/photo",project),null);assert.equal(calls.length,1);
 const denied={storage:{from(){return {async createSignedUrl(){return {data:null,error:{message:"Denied"}};}};}}};
 assert.equal(await signedAssetPhoto(denied,"a.jpg",project),null);
});

test("page photos are deduplicated into one request and object denials stay hidden",async()=>{
 let calls=0;
 const client={storage:{from(){return {async createSignedUrls(paths,expires){calls++;assert.deepEqual(paths,["a.jpg","b.jpg"]);assert.equal(expires,900);return {data:[{path:"a.jpg",signedUrl:"private-a",error:null},{path:"b.jpg",signedUrl:null,error:"Denied"}],error:null};}};}}};
 const result=await signedAssetPhotos(client,[{id:"1",photo_url:"a.jpg"},{id:"2",photo_url:"a.jpg"},{id:"3",photo_url:"b.jpg"},{id:"4",photo_url:null}],project);
 assert.deepEqual([...result],[["1","private-a"],["2","private-a"]]);assert.equal(calls,1);
 await signedAssetPhotos(client,[{id:"4",photo_url:null}],project);assert.equal(calls,1);
});

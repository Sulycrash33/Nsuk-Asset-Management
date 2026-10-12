import test from "node:test";
import assert from "node:assert/strict";
import { CameraSession } from "../src/lib/camera-session.ts";
test("stopping a pending camera startup cancels callbacks and stops its late stream",async()=>{
 const camera=new CameraSession(), generation=camera.start();let stopped=0;
 let resolve;const pending=new Promise(r=>{resolve=r;});
 camera.stop();resolve({stop(){stopped++;}});
 assert.equal(camera.isCurrent(generation),false);
 assert.equal(camera.attach(generation,await pending),false);assert.equal(stopped,1);
});
test("a newer camera startup wins and stopping releases its stream once",()=>{
 const camera=new CameraSession();let first=0,second=0,stale=0;
 const one=camera.start();assert.equal(camera.attach(one,{stop(){first++;}}),true);
 const two=camera.start();assert.equal(first,1);assert.equal(camera.isCurrent(one),false);
 assert.equal(camera.attach(one,{stop(){stale++;}}),false);assert.equal(stale,1);
 assert.equal(camera.attach(two,{stop(){second++;}}),true);
 camera.stop();camera.stop();assert.equal(second,1);assert.equal(camera.isCurrent(two),false);
});

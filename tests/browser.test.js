import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGroups } from '../extension/browser.js';
const rows = [
 {id:1,windowId:5,url:'https://a.com/',title:'A',category:'focus',confidence:0.95},
 {id:2,windowId:5,url:'https://b.com/',title:'B',category:'later',confidence:0.7},
 {id:3,windowId:5,url:'https://c.com/',title:'C',category:'focus',confidence:0.9},
 {id:4,windowId:5,url:'https://d.com/',title:'D',category:'distraction',confidence:0.9},
];
test('applying groups leaves uncertain, navigated and moved tabs untouched',async()=>{
 const groups=[];
 const api={tabs:{query:async()=>[
 {...rows[0]}, {...rows[1]}, {...rows[2],url:'https://changed.com/'}, {...rows[3],windowId:6}],
 group:async({tabIds})=>{groups.push(tabIds);return 20;}},tabGroups:{update:async()=>{}}};
 const result=await applyGroups(rows,0.8,5,api);
 assert.deepEqual(groups,[[1]]); assert.equal(result.grouped,1); assert.equal(result.skipped,2);
});
test('an all-review result never changes Chrome groups',async()=>{
 let changed=false;
 const result=await applyGroups(rows,1,5,{tabs:{query:async()=>rows,group:async()=>{changed=true;}},tabGroups:{update:async()=>{}}});
 assert.equal(changed,false); assert.equal(result.grouped,0);
});

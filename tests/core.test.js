import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTabs, buildRequest, readDecisions, categoryFor, classify } from '../extension/core.js';
const tabs = [{id:7,title:'React guide',url:'https://docs.example.com/react',windowId:2}];
test('eligible tabs exclude private/pinned/internal tabs and strip URL secrets', () => {
 const result=sanitizeTabs([
 {id:7,title:'React guide',url:'https://user:password@docs.example.com/react?token=secret#private',windowId:2},
 {id:8,url:'chrome://settings'}, {id:9,url:'https://example.com',pinned:true},
 {id:10,url:'https://example.com',incognito:true}]);
 assert.equal(result.length,1); assert.equal(result[0].url,'https://docs.example.com/react');
 assert.equal(result[0].id,7);
});
test('request ties each question to a tab and includes the user goal',()=>{
 const body=buildRequest(tabs,'Build an AI app');
 assert.equal(body.model,'jev-latest'); assert.equal(body.state.goal,'Build an AI app');
 assert.equal(body.questions.tab_7.type,'choice');
 assert.deepEqual(Object.keys(body.questions.tab_7.criteria),['focus','later','distraction','review']);
 assert.throws(()=>buildRequest(tabs,'   '),/goal/i);
 assert.throws(()=>buildRequest(Array.from({length:41},(_,id)=>({...tabs[0],id})), 'goal'),/40/);
});
test('missing or invalid answers always go to review instead of disappearing',()=>{
 const result=readDecisions([...tabs,{id:8},{id:9},{id:10}],{answers:{
 tab_7:{type:'choice',choice:'focus',confidence:0.8,probabilities:{focus:0.99}},
 tab_9:{type:'choice',choice:'made_up',confidence:1},
 tab_10:{type:'choice',choice:'focus',confidence:2}}});
 assert.equal(result.length,4); assert.equal(result[0].confidence,0.8);
 assert.deepEqual(result.slice(1).map(r=>r.category),['review','review','review']);
});
test('slider uses confidence with an inclusive threshold and keeps explicit review',()=>{
 assert.equal(categoryFor({category:'focus',confidence:0.8},0.8),'focus');
 assert.equal(categoryFor({category:'focus',confidence:0.8},0.81),'review');
 assert.equal(categoryFor({category:'review',confidence:1},0),'review');
});
test('API contract sends bearer auth and returns validated decisions',async()=>{
 const result=await classify(tabs,'Build an app','test-key',async(url,options)=>{
 assert.equal(url,'https://api.typesafe.ai/v1/systemone');
 assert.equal(options.headers.Authorization,'Bearer test-key');
 assert.equal(JSON.parse(options.body).questions.tab_7.type,'choice');
 return new Response(JSON.stringify({model:'jev-test',answers:{tab_7:{type:'choice',choice:'focus',confidence:0.9}}}),{status:200});
 });
 assert.equal(result.decisions[0].category,'focus'); assert.equal(result.model,'jev-test');
});
test('failed API requests cannot masquerade as successful classifications',async()=>{
 await assert.rejects(classify(tabs,'goal','key',async()=>new Response('',{status:401})),/key|401/i);
 await assert.rejects(classify(tabs,'goal','',()=>{throw new Error('must not fetch')}),/key/i);
 await assert.rejects(classify(tabs,'goal','key',async()=>new Response('{}')),/answers/i);
});

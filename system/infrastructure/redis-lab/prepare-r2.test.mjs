import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runR2 } from './prepare-r2.mjs';
const base=()=>({redisId:'redis',private:true,publishedRedis:false,redisHealthy:true,gatewayHealthy:true,
  volume:{name:'3p-redis-lab_redis_data',createdAt:'fixed'},mount:'3p-redis-lab_redis_data',
  aof:{appendonly:'yes',appendfsync:'always',policy:'noeviction',write:'ok'},
  services:[{name:'redis',id:'redis',image:'r',started:'before'},{name:'gateway',id:'gateway',image:'g',started:'same'}]});
const plan=()=>({createdAt:new Date().toISOString(),key:'3p:redis-test:11111111-1111-4111-8111-111111111111:persistence',baseline:base()});
function adapter(options={}){
  const calls=[];let restarted=false;
  return {calls,snapshot:async()=>{const s=base();if(restarted)s.services[0].started='after';if(options.volumeMismatch)s.volume.createdAt='changed';if(options.otherChanged&&restarted)s.services[1].started='changed';return s;},
    marker:async phase=>{calls.push(phase);return options.markerFail!==phase;},smoke:async()=>!options.smokeFail,
    restart:async()=>{calls.push('restart');restarted=true;},waitReady:async()=>!options.notReady};
}
test('prepare creates only synthetic marker and NEVER restarts',async()=>{
  const io=adapter(),r=await runR2({mode:'prepare'},io);assert.equal(r.status,'PREPARED_NOT_RESTARTED');assert.equal(r.restarted,false);assert.deepEqual(io.calls,['write','read']);
});
test('execute without explicit authorization performs no Docker/marker work',async()=>{
  const io=adapter(),r=await runR2({mode:'execute',plan:plan()},io);assert.equal(r.status,'FAIL');assert.deepEqual(io.calls,[]);
});
test('stale plan cannot restart',async()=>{
  const p=plan();p.createdAt='2000-01-01';const io=adapter(),r=await runR2({mode:'execute',authorized:true,plan:p},io);assert.equal(r.status,'FAIL');assert.ok(!io.calls.includes('restart'));
});
test('changed volume prevents restart',async()=>{
  const io=adapter({volumeMismatch:true}),r=await runR2({mode:'execute',authorized:true,plan:plan()},io);assert.equal(r.status,'FAIL');assert.ok(!io.calls.includes('restart'));
});
test('unconfirmed marker write is not retried or automatically removed',async()=>{
  const io=adapter({markerFail:'write'}),r=await runR2({mode:'prepare'},io);assert.equal(r.status,'FAIL');assert.deepEqual(io.calls,['write']);
});
test('readiness failure restarts at most once and preserves marker',async()=>{
  const io=adapter({notReady:true}),r=await runR2({mode:'execute',authorized:true,plan:plan()},io);assert.equal(r.status,'FAIL');assert.equal(io.calls.filter(x=>x==='restart').length,1);assert.ok(!io.calls.includes('cleanup'));
});
test('unrelated service change fails without destructive rollback',async()=>{
  const io=adapter({otherChanged:true}),r=await runR2({mode:'execute',authorized:true,plan:plan()},io);assert.equal(r.status,'FAIL');assert.ok(!io.calls.includes('cleanup'));
});
test('authorized simulated success checks recovery and cleans only owned marker',async()=>{
  const io=adapter(),r=await runR2({mode:'execute',authorized:true,plan:plan()},io);assert.equal(r.status,'PASS_RESTART_RECOVERY_ONLY');assert.deepEqual(io.calls,['read','restart','read','cleanup']);
});
test('ambiguous restart result is unknown and never retried',async()=>{
  const io=adapter();let calls=0;io.restart=async()=>{calls++;throw new Error('timeout');};
  const r=await runR2({mode:'execute',authorized:true,plan:plan()},io);
  assert.equal(r.status,'FAIL');assert.equal(r.restarted,null);assert.equal(calls,1);assert.ok(!io.calls.includes('cleanup'));
});

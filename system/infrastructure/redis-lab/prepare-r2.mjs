// Principal Redis: prepare is safe metadata + one synthetic marker, no restart.
// The execute branch requires BOTH explicit mode and authorization; never a rollback.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const markerPattern=/^3p:redis-test:[0-9a-f-]{36}:persistence$/;
const fail=code=>{throw new Error(code);};
function validSnapshot(s) {
  return s.private && !s.publishedRedis && s.redisHealthy && s.gatewayHealthy &&
    s.volume.name==='3p-redis-lab_redis_data' && s.mount===s.volume.name &&
    s.aof.appendonly==='yes' && s.aof.appendfsync==='always' && s.aof.policy==='noeviction' && s.aof.write==='ok';
}
const unchanged=(before,after,allowRestart=false)=>before.services.every(old=>{
  const now=after.services.find(x=>x.name===old.name);
  return now && now.id===old.id && now.image===old.image &&
    (allowRestart && old.id===before.redisId || now.started===old.started);
});

export async function runR2(options,io) {
  const report={status:'FAIL',checks:[],restarted:false,plan:null};
  const check=(name,ok)=>{report.checks.push({name,status:ok?'PASS':'FAIL'});if(!ok)fail(name);};
  try {
    check('explicit-mode',['prepare','execute'].includes(options.mode));
    if(options.mode==='execute')check('explicit-restart-authorization',options.authorized===true);
    const before=await io.snapshot(); report.before=before;
    check('lab-identity-volume-AOF-readiness',validSnapshot(before));
    if(options.mode==='prepare'){
      const key=`3p:redis-test:${randomUUID()}:persistence`;
      report.plan={createdAt:new Date().toISOString(),key,baseline:before};
      check('HTTPS-CAS-preflight',await io.smoke());
      // No retry: a lost response after NX may mean the marker was written.
      check('synthetic-marker-write-confirmed',await io.marker('write',key));
      check('synthetic-marker-read-confirmed',await io.marker('read',key));
      const after=await io.snapshot();report.after=after;
      check('no-existing-container-restarted',unchanged(before,after));
      check('volume-identity-preserved',JSON.stringify(before.volume)===JSON.stringify(after.volume));
      report.status='PREPARED_NOT_RESTARTED';return report;
    }
    const plan=options.plan;
    check('valid-plan-marker',!!plan && markerPattern.test(plan.key??''));
    const age=Date.now()-Date.parse(plan.createdAt);
    check('plan-age-within-24h',Number.isFinite(age)&&age>=0&&age<86400000);
    check('same-plan-inventory',plan.baseline.redisId===before.redisId &&
      unchanged(plan.baseline,before) && JSON.stringify(plan.baseline.volume)===JSON.stringify(before.volume));
    report.plan=plan;
    check('existing-marker-confirmed-before-restart',await io.marker('read',plan.key));
    // At most ONE restart. Readiness polls only inspect state; no repeated writes.
    report.restartAttempted=true;
    report.restarted=null; // A transport timeout cannot prove restart did not occur.
    await io.restart(before.redisId);report.restarted=true;
    check('readiness-after-restart',await io.waitReady());
    check('persistent-marker-recovered-HTTPS',await io.marker('read',plan.key));
    check('HTTPS-CAS-after-restart',await io.smoke());
    const after=await io.snapshot();report.after=after;
    check('same-volume-after-restart',JSON.stringify(before.volume)===JSON.stringify(after.volume)&&before.mount===after.mount);
    check('no-other-container-changed',unchanged(before,after,true));
    check('post-restart-AOF-health',validSnapshot(after));
    check('cleanup-only-owned-marker',await io.marker('cleanup',plan.key));
    report.status='PASS_RESTART_RECOVERY_ONLY';
  }catch(error){report.failure=report.checks.at(-1)?.status==='FAIL'?report.checks.at(-1).name:'execution-failed-no-automatic-retry';}
  return report;
}

export function dockerAdapter() {
  function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});if(r.status!==0)fail('docker-unavailable');return r.stdout;}
  const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
  const infoFields=text=>Object.fromEntries(text.trim().split(/\r?\n/).filter(x=>x.includes(':')).map(x=>x.split(':',2)));
  const snapshot=async()=>{
    const redis=inspect('3p-redis-lab-redis-1'),gateway=inspect('3p-redis-lab-gateway-1');
    for(const [x,service]of[[redis,'redis'],[gateway,'gateway']])if(x.Config.Labels['com.docker.compose.project']!=='3p-redis-lab'||x.Config.Labels['com.docker.compose.service']!==service)fail('unexpected-identity');
    const ids=docker(['ps','-aq']).trim().split(/\s+/);const all=JSON.parse(docker(['inspect',...ids]));
    const volume=JSON.parse(docker(['volume','inspect','3p-redis-lab_redis_data']))[0];
    const config=JSON.parse(docker(['exec',redis.Id,'redis-cli','--json','CONFIG','GET','appendonly','appendfsync','maxmemory-policy']));
    const persistence=infoFields(docker(['exec',redis.Id,'redis-cli','--raw','INFO','persistence']));
    return {redisId:redis.Id,redisHealthy:redis.State.Health?.Status==='healthy',gatewayHealthy:gateway.State.Health?.Status==='healthy',
      private:JSON.parse(docker(['network','inspect','3p-redis-lab_redis_private']))[0].Internal,
      publishedRedis:Object.values(redis.NetworkSettings.Ports).some(Boolean),mount:redis.Mounts.find(x=>x.Destination==='/data')?.Name,
      volume:{name:volume.Name,createdAt:volume.CreatedAt},
      aof:{appendonly:config.appendonly,appendfsync:config.appendfsync,policy:config['maxmemory-policy'],write:persistence.aof_last_write_status,size:Number(persistence.aof_current_size)},
      services:all.map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}))};
  };
  const helper=fileURLToPath(new URL('./gateway/run-loopback-smoke.mjs',import.meta.url));
  function smokeRun(phase,key){
    if(key&&!markerPattern.test(key))return false;
    const r=spawnSync(process.execPath,[helper,...(phase?[phase]:[])],{env:{...process.env,THREEP_PERSISTENCE_TEST_KEY:key??''},encoding:'utf8',timeout:20000});
    if(r.status!==0)return false;
    try{const result=JSON.parse(r.stdout);return result.status==='PASS'&&result.results.length>0;}catch{return false;}
  }
  return {snapshot,marker:async(phase,key)=>smokeRun(phase,key),smoke:async()=>smokeRun(),
    restart:async id=>{const expected=inspect('3p-redis-lab-redis-1');if(expected.Id!==id)fail('redis-identity-changed');docker(['restart',id]);},
    waitReady:async()=>{
      const deadline=Date.now()+45000;
      while(Date.now()<deadline){
        const state=spawnSync('docker',['inspect','3p-redis-lab-redis-1','3p-redis-lab-gateway-1'],{encoding:'utf8',timeout:2000});
        try{if(state.status===0&&JSON.parse(state.stdout).every(x=>x.State.Health?.Status==='healthy'))return true;}catch{}
        await new Promise(r=>setTimeout(r,1000));
      }
      return false;
    }};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  const mode=args.includes('--execute')===args.includes('--prepare')?null:args.includes('--execute')?'execute':'prepare';
  if(!mode||!args.includes('--report')){console.error('Require --prepare OR --execute and --report; execute also requires --authorize-redis-restart and --plan');process.exitCode=1;}
  else{
    let result;
    try {
      const plan=args.includes('--plan')?JSON.parse(readFileSync(value('--plan'),'utf8')).plan:null;
      result=await runR2({mode,authorized:args.includes('--authorize-redis-restart'),plan},dockerAdapter());
    }catch{result={status:'FAIL',restarted:false,failure:'invalid-plan-or-report-configuration',checks:[]};}
    writeFileSync(value('--report'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({status:result.status,restarted:result.restarted,checks:result.checks}));
    process.exitCode=result.status==='FAIL'?1:0;
  }
}

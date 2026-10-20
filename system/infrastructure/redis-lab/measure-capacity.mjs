// Read-only metadata census. Never reads values or prints key names/identifiers.
import { spawnSync } from 'node:child_process';
const source = `
import { createClient } from 'redis';
const c=createClient({url:'redis://redis:6379',disableOfflineQueue:true,socket:{connectTimeout:2000}});
c.on('error',()=>{});
const pick=(text,names)=>Object.fromEntries(text.split(/\\r?\\n/).map(x=>{const i=x.indexOf(':');return [x.slice(0,i),x.slice(i+1)]}).filter(([k])=>names.includes(k)));
try {
 await c.connect();
 const groups={}, seen=new Set(); let cursor='0',complete=false;
 const category=k=> k.startsWith('3p:correction:') ? (k.endsWith(':pending')?'correction-lock':k.endsWith(':original')?'correction-original':'correction-operation') :
 k.startsWith('3p:audit:')?'audit':k.startsWith('3p:rate:')?'rate':k.includes(':session:')?'session':k.includes(':user:')?'user-revocation':'other';
 do {
   const [next,keys]=await c.sendCommand(['SCAN',cursor,'COUNT','100']);cursor=String(next);
   for(const key of keys) {
     if(seen.has(key))continue;seen.add(key);
     const group=groups[category(key)]??={count:0,nonExpiring:0,expiring:0,vanished:0,memoryBytes:0};group.count++;
     const ttl=Number(await c.sendCommand(['PTTL',key]));
     if(ttl===-1)group.nonExpiring++;else if(ttl===-2)group.vanished++;else group.expiring++;
     group.memoryBytes+=Number(await c.sendCommand(['MEMORY','USAGE',key])??0);
     if(seen.size>=10000)break;
   }
   if(cursor==='0'){complete=true;break;}
 }while(seen.size<10000);
 console.log(JSON.stringify({utc:new Date().toISOString(),scope:'metadata only; SCAN is not a transaction/snapshot',complete,groups,
  memory:pick(await c.info('memory'),['used_memory','used_memory_rss','used_memory_peak','used_memory_dataset','maxmemory','maxmemory_policy']),
  persistence:pick(await c.info('persistence'),['aof_enabled','aof_current_size','aof_base_size','aof_last_write_status','aof_last_bgrewrite_status','aof_rewrite_in_progress','aof_pending_bio_fsync'])}));
}catch{console.log(JSON.stringify({status:'FAIL',reason:'metadata census unavailable'}));process.exitCode=1;}
finally{if(c.isOpen)await c.quit();}
`;
const identity=spawnSync('docker',['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}','3p-redis-lab-gateway-1'],{encoding:'utf8'});
if(identity.status!==0||identity.stdout.trim()!=='3p-redis-lab')throw new Error('Unexpected lab identity');
const result=spawnSync('docker',['exec','-i','3p-redis-lab-gateway-1','node','--input-type=module'],{input:source,encoding:'utf8',timeout:60000});
if(result.stdout)process.stdout.write(result.stdout);
if(result.status!==0)process.exitCode=1;

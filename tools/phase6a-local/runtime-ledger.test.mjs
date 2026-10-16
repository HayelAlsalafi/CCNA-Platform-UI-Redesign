import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifyRuntimeLedger} from './runtime-ledger.mjs';
import {policy,migrationManifest,assertLedger,LocalRuntimeError,cleanEnvironment} from './policy.mjs';
import {upgradeSnapshots} from './upgrade.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),manifest=migrationManifest(root),snapshots=upgradeSnapshots(root);
const ledgerPassword='offline-migrator-password-sentinel',appPassword='offline-app-password-sentinel';
function fixture(mode='api'){
  const input={host:policy.host,port:policy.port,database:policy.database,role:policy.appRole,password:appPassword,systemIdentifier:policy.upgradeSystemIdentifier,
    publishableKey:['pk','test',Buffer.from(policy.clerkInstance+'$').toString('base64url')].join('_'),...(mode==='web'?{}:{secretKey:['sk','test','offline_fixture'].join('_')})};
  const calls=[],state={created:0,ended:0,verified:0};
  const rows=manifest.map(m=>({hash:m.hash,created_at:String(m.when)}));
  const client={connect:async()=>{},end:async()=>{state.ended++;},query:async sql=>{
    calls.push(sql);
    if(sql.includes('identity()'))return{rows:[{identity:{database:policy.database,sessionRole:policy.migrationRole,host:policy.host,port:policy.port,versionNumber:180006,dataDirectory:policy.dataDirectory,systemIdentifier:policy.upgradeSystemIdentifier,neon:null}}]};
    if(sql.includes('pg_auth_members'))return{rows:[{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolreplication:false,rolbypassrls:false,membership:false}]};
    if(sql.includes('__drizzle_migrations'))return{rows};return{rows:[]};
  }};
  const deps={verifyLocalService:async()=>{},createClient:config=>{state.created++;assert.equal(config.user,policy.migrationRole);assert.equal(config.password,ledgerPassword);assert.equal(config.database,policy.database);return client;},
    verifyState:async(c,m,s,phase,empty)=>{state.verified++;assert.equal(phase,'after');assert.equal(empty,false);assert.equal(m,manifest);assert.equal(s,snapshots);assertLedger((await c.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows,m);}};
  return{input,calls,state,rows,deps};
}
for(const mode of ['api','web','check'])test(mode+' verifies the complete reviewed ledger on a separate read-only migrator connection and closes it',async()=>{
  const f=fixture(mode),result=await verifyRuntimeLedger(mode,f.input,ledgerPassword,manifest,snapshots,f.deps,mode==='check'?{}:{start:true});
  assert.equal(result.ledgerEntries,manifest.length);assert.equal(result.readOnly,true);assert.equal(f.state.ended,1);assert.equal(f.state.verified,1);
  assert(f.calls.includes('BEGIN READ ONLY'));assert.equal(f.calls.at(-1),'ROLLBACK');assert(f.calls.every(q=>/^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(q)));
  assert.equal(f.input.role,policy.appRole);assert.equal(f.input.password,appPassword);
  assert(!JSON.stringify(result).includes(ledgerPassword));assert(!JSON.stringify(cleanEnvironment({},mode,f.input)).includes(ledgerPassword));
});
test('missing migrator credential fails before connecting and never falls back to app password',async()=>{
  const f=fixture();await assert.rejects(()=>verifyRuntimeLedger('api',f.input,undefined,manifest,snapshots,f.deps,{start:true}),/Known migrator password/);assert.equal(f.state.created,0);
});
test('changed migration hashes fail closed, roll back and close the verifier connection',async()=>{
  const f=fixture();f.rows[6].hash='unexpected';await assert.rejects(()=>verifyRuntimeLedger('api',f.input,ledgerPassword,manifest,snapshots,f.deps,{start:true}),LocalRuntimeError);
  assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.state.ended,1);
});
test('unexpected runtime target fails before opening the migrator connection',async()=>{
  const f=fixture();await assert.rejects(()=>verifyRuntimeLedger('api',{...f.input,database:'postgres'},ledgerPassword,manifest,snapshots,f.deps,{start:true}),LocalRuntimeError);assert.equal(f.state.created,0);
});
test('launcher keeps ledger SQL out of app-role privilege checking and strips the private credential',()=>{
  const source=readFileSync(new URL('./run.mjs',import.meta.url),'utf8'),runtime=source.slice(source.indexOf('async function runtimePrivileges'),source.indexOf('function report'));
  assert(!runtime.includes('__drizzle_migrations'));assert(runtime.includes("has_schema_privilege(current_user,'drizzle','USAGE') AS ledger_access"));
  assert(source.includes('delete input.ledgerPassword'));assert(source.indexOf('await verifyRuntimeLedger')<source.indexOf('const checked=await preflight'));
  assert(!readFileSync(new URL('./runtime-ledger.mjs',import.meta.url),'utf8').match(/\bGRANT\b/));
});

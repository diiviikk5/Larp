import assert from 'node:assert/strict';
import {jsonLines} from '../server/adapters/process.mjs';
const started=Date.now();
const r=await jsonLines(process.execPath,['-e',`console.log(JSON.stringify({type:'turn.completed'}));setInterval(()=>{},1000)`],{onJson:()=>{},isComplete:m=>m.type==='turn.completed',completionGraceMs:100});
assert.equal(r.exitCode,0);assert.ok(Date.now()-started<5000);
const fail=await jsonLines(process.execPath,['-e','process.exit(7)'],{onJson:()=>{}});assert.equal(fail.exitCode,7);
console.log('PASS completed turns release lingering runtimes; real process failures remain failures');

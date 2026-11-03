// A stand-in for the Codex CLI's sign-in, for tests (LARP_CODEX=test/fake-codex.cmd):
//   login         prints the sign-in link like Codex does, then waits until "the browser" finishes
//                 (a test writes <CODEX_HOME>/auth.json) and exits
//   login status  "Logged in using ChatGPT" once auth.json exists, else "Not logged in"
import fs from 'node:fs';
import path from 'node:path';

const home = process.env.CODEX_HOME || '.';
const auth = path.join(home, 'auth.json');
const [cmd, sub] = process.argv.slice(2);
if (cmd === 'login' && sub === 'status') {
  if (fs.existsSync(auth)) { console.log('Logged in using ChatGPT'); process.exit(0); }
  console.log('Not logged in');
  process.exit(1);
}
if (cmd === 'login') {
  console.log('Starting local login server on http://localhost:1455.');
  console.log('If your browser did not open, navigate to this URL to authenticate:\n');
  console.log('https://auth.openai.com/oauth/authorize?response_type=code&client_id=test&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback&state=test\n');
  const timer = setInterval(() => { if (fs.existsSync(auth)) { console.log('Successfully logged in'); clearInterval(timer); process.exit(0); } }, 300);
} else if (cmd === 'exec') {
  // A busy run: Codex-style JSON events, FAKE_CODEX_RATE a second for FAKE_CODEX_SECONDS, then done.
  const rate = Number(process.env.FAKE_CODEX_RATE) || 40;
  const seconds = Number(process.env.FAKE_CODEX_SECONDS) || 20;
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  out({ type: 'thread.started', thread_id: 'fake' });
  let n = 0;
  const timer = setInterval(() => {
    n++;
    out(n % 3 ? { type: 'item.completed', item: { type: 'reasoning', text: `Thinking step ${n}: ${'reading the code and planning the next change '.repeat(6)}` } }
      : { type: 'item.completed', item: { type: 'command_execution', command: `rg -n "settle" src test # step ${n}` } });
    if (n >= rate * seconds) {
      clearInterval(timer);
      out({ type: 'item.completed', item: { type: 'agent_message', text: `Done after ${n} steps.` } });
      out({ type: 'turn.completed' });
      setTimeout(() => process.exit(0), 50);
    }
  }, 1000 / rate);
} else {
  console.log('fake codex');
}

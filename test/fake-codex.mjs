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
} else {
  console.log('fake codex');
}

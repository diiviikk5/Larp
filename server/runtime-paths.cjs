const fs = require('node:fs');
const path = require('node:path');
function codexCommand() {
  if (process.env.LARP_CODEX) return process.env.LARP_CODEX;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const native = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin', 'codex.exe');
    if (fs.existsSync(native)) return native;
  }
  return 'codex';
}
module.exports = { codexCommand };

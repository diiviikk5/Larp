// The demo project: a tiny family expense splitter that two people's agents can extend together.
// Every computer creates exactly the same first commit (fixed files, author, date and message), so
// Larp sees everyone's copy as the same repository, without GitHub or copying folders around.
import fs from 'node:fs/promises';
import path from 'node:path';
import { run, git } from './adapters/process.mjs';

const FILES = {
  'package.json': `{
  "name": "family-expenses",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "test": "node --test" }
}
`,
  'README.md': `# family-expenses

A small library for splitting shared family expenses. Larp's demo project.

Ideas for agents to build:
- \`settle(expenses)\`: who pays whom, with the fewest payments
- \`monthlyReport(expenses, month)\`: totals by category and by person
- a CLI: \`node cli.js report 2026-11\`
`,
  'src/expenses.js': `/** An expense: { description, amount, paidBy, splitAmong: [names], category, date: 'YYYY-MM-DD' } */

/** Total amount spent. */
export function total(expenses) {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** How much each person paid. */
export function paidBy(expenses) {
  const out = {};
  for (const e of expenses) out[e.paidBy] = (out[e.paidBy] || 0) + e.amount;
  return out;
}

/** How much each person owes in total, splitting every expense equally among splitAmong. */
export function shares(expenses) {
  const out = {};
  for (const e of expenses) {
    const each = e.amount / e.splitAmong.length;
    for (const name of e.splitAmong) out[name] = (out[name] || 0) + each;
  }
  return out;
}
`,
  'test/expenses.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { total, paidBy, shares } from '../src/expenses.js';

const expenses = [
  { description: 'Groceries', amount: 1200, paidBy: 'Mum', splitAmong: ['Mum', 'Dad', 'Riya'], category: 'food', date: '2026-11-02' },
  { description: 'Electricity', amount: 900, paidBy: 'Dad', splitAmong: ['Mum', 'Dad', 'Riya'], category: 'bills', date: '2026-11-05' },
];

test('total', () => assert.equal(total(expenses), 2100));
test('paidBy', () => assert.deepEqual(paidBy(expenses), { Mum: 1200, Dad: 900 }));
test('shares', () => assert.deepEqual(shares(expenses), { Mum: 700, Dad: 700, Riya: 700 }));
`,
  '.gitignore': 'node_modules\n',
};

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Larp', GIT_AUTHOR_EMAIL: 'demo@larp.local', GIT_AUTHOR_DATE: '2026-11-01T00:00:00+0000',
  GIT_COMMITTER_NAME: 'Larp', GIT_COMMITTER_EMAIL: 'demo@larp.local', GIT_COMMITTER_DATE: '2026-11-01T00:00:00+0000',
};

/** Create (or reuse) the demo project in parent/family-expenses. Returns its path. */
export async function createDemoProject(parent) {
  const dir = path.join(parent, 'family-expenses');
  const exists = await fs.access(path.join(dir, '.git')).then(() => true, () => false);
  if (exists) return dir;
  await fs.mkdir(dir, { recursive: true });
  for (const [file, content] of Object.entries(FILES)) {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), content);
  }
  const env = { ...process.env, ...IDENTITY };
  const steps = [
    ['init', '-q', '-b', 'main'],
    ['-c', 'core.autocrlf=false', 'add', '-A'],
    ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Family expenses: starting point'],
  ];
  for (const args of steps) {
    const { exitCode, output } = await run('git', args, { cwd: dir, env });
    if (exitCode !== 0) throw new Error(`Couldn't set up the demo project (git ${args.find((a) => !a.startsWith('-'))}): ${output.trim().slice(0, 300)}`);
  }
  await git(dir, ['config', 'user.name', 'Larp']).catch(() => {});
  return dir;
}

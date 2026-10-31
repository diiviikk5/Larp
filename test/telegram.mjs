// Telegram control, end to end against a stand-in Telegram Bot API: a family links their chats, Dad
// asks Mum's agent for something from Telegram, Mum approves with a button, Dad asks for a change,
// then accepts; a checklist reaches Dad and he takes an item; an unknown chat gets nothing.
//   npm run test:telegram
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// ---------- a stand-in for api.telegram.org ----------
const updates = [];          // waiting for getUpdates
const sent = [];             // everything the bot sent: { chat_id, text, reply_markup }
let nextUpdate = 1;
let nextMessage = 100;
const waiters = new Set();
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const args = body ? JSON.parse(body) : {};
  const [, , method] = req.url.split('/');
  const ok = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
  if (!req.url.startsWith('/bot123456:')) { res.writeHead(401); res.end(JSON.stringify({ ok: false, description: 'Unauthorized' })); return; }
  if (method === 'getMe') return ok({ id: 1, is_bot: true, username: 'larp_family_bot' });
  if (method === 'getUpdates') {
    const take = () => { const batch = updates.filter((u) => u.update_id >= (args.offset || 0)); return batch; };
    let batch = take();
    if (!batch.length) await new Promise((r) => { const w = () => { waiters.delete(w); r(); }; waiters.add(w); setTimeout(w, 300); });
    batch = take();
    return ok(batch);
  }
  if (method === 'sendMessage') { const m = { message_id: nextMessage++, ...args }; sent.push(m); return ok(m); }
  if (method === 'answerCallbackQuery' || method === 'editMessageReplyMarkup') return ok(true);
  res.writeHead(404); res.end(JSON.stringify({ ok: false, description: 'no such method' }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.LARP_TELEGRAM_API = `http://127.0.0.1:${server.address().port}`;

const push = (update) => { updates.push({ update_id: nextUpdate++, ...update }); for (const w of [...waiters]) w(); };
const say = (chatId, text) => push({ message: { message_id: nextMessage++, chat: { id: chatId, type: 'private' }, from: { username: `u${chatId}` }, text } });
const press = (chatId, data) => push({ callback_query: { id: `cb${nextUpdate}`, data, message: { message_id: 1, chat: { id: chatId } } } });
async function until(fn, what) {
  for (let i = 0; i < 100; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error(`Timed out waiting for: ${what}`);
}
const lastTo = (chatId, match) => until(() => [...sent].reverse().find((m) => m.chat_id === chatId && (!match || match.test(m.text))), `a message to ${chatId} matching ${match}`);
const step = (t) => console.log(`\n▶ ${t}`);
const ok = (t) => console.log(`  ✓ ${t}`);

// ---------- a family space ----------
const { Coordinator } = await import('../server/coordinator.mjs');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'larp-telegram-'));
const c = new Coordinator({ dataDir: dir, meko: null });
await c.init();
try {
  const { person: mum, space, token: mumToken } = c.createSpaceWithOwner({ spaceName: 'Sharma home', kind: 'home', ownerName: 'Mum' });
  const { person: dad, token: dadToken } = c.join({ code: c.createInvite(mum.id, space.id).code, name: 'Dad' });
  const { host } = c.registerHost(mum.id, { name: 'Family laptop' });
  host.online = true;
  const sol = c.registerAgent(host, { ownerToken: mumToken, name: 'Sol', runtime: 'codex', spaceIds: [space.id] });
  c.registerAgent(host, { ownerToken: dadToken, name: 'Byte', runtime: 'codex', spaceIds: [space.id] });
  const MUM = 1001, DAD = 2002, STRANGER = 3003;

  step('Mum connects a bot and everyone links their Telegram');
  await assert.rejects(async () => c.route('POST', ['telegram', 'connect'], dadToken, { token: '123456:' + 'A'.repeat(35) }), /Only the person who started/);
  await c.route('POST', ['telegram', 'connect'], mumToken, { token: '123456:' + 'A'.repeat(35) });
  assert.equal(c.viewFor(mum.id).telegram.botName, 'larp_family_bot');
  assert.ok(!JSON.stringify(c.viewFor(mum.id)).includes('AAAAAAAAAA'), 'the bot token never reaches the app');
  for (const [person, token, chat] of [[mum, mumToken, MUM], [dad, dadToken, DAD]]) {
    const { url } = c.route('POST', ['telegram', 'link'], token, {});
    assert.match(url, /^https:\/\/t\.me\/larp_family_bot\?start=\w+$/);
    say(chat, `/start ${url.split('=')[1]}`);
    await lastTo(chat, new RegExp(`Linked, ${person.name}`));
  }
  assert.equal(c.viewFor(dad.id).telegram.linked, true);
  ok('Mum connected the bot (Dad could not); both linked with one-tap links; the token stays on the coordinator');

  step('Dad asks Mum\'s agent from Telegram; Mum approves with a button');
  say(DAD, '@Sol Plan Saturday lunch for everyone, under ₹3000');
  await lastTo(DAD, /needs to approve/);
  const ask = await lastTo(MUM, /Run "Plan Saturday lunch/);
  assert.equal(ask.reply_markup.inline_keyboard[0][0].text, '✅ Approve');
  press(MUM, ask.reply_markup.inline_keyboard[0][0].callback_data);
  const task = await until(() => Object.values(c.s.tasks).find((t) => t.status === 'queued'), 'task queued after approval');
  assert.equal(task.kind, 'general');
  ok(`"${task.title}" went to Sol; Mum approved it from her chat`);

  step('The result reaches Dad; he asks for a change, then accepts');
  task.status = 'running';
  c.hostResult(host, task.id, { summary: 'Lunch at 1pm at Saffron, about ₹2600 for 4.' });
  const done = await lastTo(DAD, /Sol finished/);
  assert.match(done.text, /Saffron/);
  press(DAD, done.reply_markup.inline_keyboard[0][1].callback_data);
  await lastTo(DAD, /What should change/);
  say(DAD, 'Somewhere vegetarian please');
  await until(() => task.status === 'queued' && task.feedback.at(-1)?.text === 'Somewhere vegetarian please', 'revision queued with feedback');
  task.status = 'running';
  c.hostResult(host, task.id, { summary: 'Lunch at 1pm at Sattvik (all vegetarian), about ₹2400.' });
  const again = await lastTo(DAD, /Sattvik/);
  press(DAD, again.reply_markup.inline_keyboard[0][0].callback_data);
  await until(() => task.status === 'accepted', 'accepted');
  ok('Dad asked for a vegetarian place by typing, got the new result and accepted it, all in Telegram');

  step('A checklist reaches Dad and he takes an item');
  const list = c.createChecklist(mum.id, { spaceId: space.id, title: 'Clinic visit', items: ['Drive to clinic', 'Pick up reports'] });
  const todo = await lastTo(DAD, /Clinic visit/);
  press(DAD, todo.reply_markup.inline_keyboard[0][0].callback_data);
  await until(() => list.items[0].ownerId === dad.id, 'Dad took the item');
  assert.ok(!sent.some((m) => m.chat_id === MUM && /Clinic visit/.test(m.text)), 'the person who made the list is not pinged');
  ok('Dad took "Drive to clinic" with one tap');

  step('Typing a plain task goes to your own agent; strangers get nothing');
  say(DAD, 'Remind me what we spent on groceries this month');
  await lastTo(DAD, /Byte is on it/);
  say(STRANGER, 'hello');
  const reply = await lastTo(STRANGER);
  assert.match(reply.text, /isn’t linked/);
  say(STRANGER, '/start not-a-real-code');
  await lastTo(STRANGER, /Link my Telegram/);
  assert.equal(Object.values(c.s.tasks).length, 2, 'the stranger created nothing');
  ok('Dad\'s message became a task for his own agent Byte; an unlinked chat could do nothing');

  step('Grandma joins from a Telegram invite, without installing Larp');
  const GRANDMA = 4004;
  const { url: invite } = c.route('POST', ['telegram', 'invite'], mumToken, { spaceId: space.id });
  assert.match(invite, /\?start=j_\w+$/);
  push({ message: { message_id: nextMessage++, chat: { id: GRANDMA, type: 'private' }, from: { first_name: 'Dadi' }, text: `/start ${invite.split('=')[1]}` } });
  await lastTo(GRANDMA, /Welcome to Sharma home, Dadi/);
  const dadi = Object.values(c.s.people).find((p) => p.name === 'Dadi');
  assert.ok(space.memberIds.includes(dadi.id));
  const meds = c.createChecklist(mum.id, { spaceId: space.id, title: 'Evening medicines', items: ['Give BP tablet at 9pm'] });
  const ping = await lastTo(GRANDMA, /Evening medicines/);
  press(GRANDMA, ping.reply_markup.inline_keyboard[0][0].callback_data);
  await until(() => meds.items[0].ownerId === dadi.id, 'Dadi took the item');
  ok('Dadi tapped one link, pressed Start, joined the space and took "Give BP tablet at 9pm"');

  console.log('\nAll Telegram checks passed.');
} finally {
  await c.close();
  server.closeAllConnections();
  server.close();
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

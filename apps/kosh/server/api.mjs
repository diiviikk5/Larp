// Kosh's API: a family's money, kept in one JSON file on this computer.
// The web app and Larp use the same endpoints with a bearer token. The web app gets the token from
// /api/session (same-origin only); Larp is given it once when you connect the two.
// Amounts are whole rupees. Every change also writes a line to the family activity feed.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const id = (p) => `${p}_${crypto.randomBytes(5).toString('hex')}`;
const today = () => new Date().toISOString().slice(0, 10);
const month = (d = today()) => d.slice(0, 7);
const MAX_BODY = 200_000;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const str = (v, name, max = 120, optional = false) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; fail(400, `${name} is required`); }
  if (typeof v !== 'string' || v.length > max) fail(400, `${name} is invalid`);
  return v.trim();
};
const rupees = (v, name, { min = 1, max = 1e9, optional = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; fail(400, `${name} is required`); }
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${name} must be between ₹${min} and ₹${max}`);
  return n;
};
const dateStr = (v, name) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) fail(400, `${name} must be YYYY-MM-DD`); return v; };
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const EXPENSE = ['Groceries', 'Rent & home', 'Utilities', 'Education', 'Health', 'Transport', 'Dining out', 'Shopping', 'Festivals & gifts', 'Entertainment', 'EMI & loans', 'Pocket money', 'Other'];
export const INCOME = ['Salary', 'Business', 'Interest', 'Gift', 'Refund', 'Other income'];
const ROLES = ['parent', 'grandparent', 'adult', 'child'];
const KINDS = ['bank', 'upi', 'cash', 'card', 'savings'];
const COLORS = ['#ff6a3a', '#7a3cff', '#e8384f', '#1f9e74', '#2f6fde', '#c98a12'];

function empty() {
  return { version: 1, token: crypto.randomBytes(24).toString('base64url'), members: [], accounts: [], transactions: [], budgets: {}, bills: [], goals: [], requests: [], activity: [], createdAt: new Date().toISOString() };
}

export class Kosh {
  constructor({ dataDir }) { this.file = path.join(dataDir, 'kosh.json'); this.writing = Promise.resolve(); }

  async load() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try { this.db = { ...empty(), ...JSON.parse(await fs.readFile(this.file, 'utf8')) }; } catch (e) { if (e.code !== 'ENOENT') throw e; this.db = empty(); await this.save(); }
    return this;
  }

  save() {
    const data = JSON.stringify(this.db, null, 1);
    this.writing = this.writing.then(async () => { await fs.writeFile(this.file + '.tmp', data); await fs.rename(this.file + '.tmp', this.file); });
    return this.writing;
  }

  member(mid) { return this.db.members.find((m) => m.id === mid) || fail(404, 'Family member not found'); }
  account(aid) { return this.db.accounts.find((a) => a.id === aid) || fail(404, 'Account not found'); }
  name(mid) { return this.db.members.find((m) => m.id === mid)?.name || 'Someone'; }

  /** The family's shared log: who did what with money, newest last. */
  log(actorId, kind, text, extra = {}) {
    this.db.activity.push({ id: id('act'), at: new Date().toISOString(), actorId: actorId || null, kind, text, ...extra });
    if (this.db.activity.length > 400) this.db.activity.splice(0, this.db.activity.length - 400);
  }

  // ---------- derived views ----------

  monthView(m = month()) {
    const tx = this.db.transactions.filter((t) => month(t.date) === m);
    const spend = {}; let income = 0; let spent = 0;
    for (const t of tx) {
      if (t.type === 'expense') { spend[t.category] = (spend[t.category] || 0) + t.amount; spent += t.amount; }
      if (t.type === 'income') income += t.amount;
    }
    const budgets = Object.entries(this.db.budgets).map(([category, limit]) => ({ category, limit, spent: spend[category] || 0 }));
    return { month: m, income, spent, saved: income - spent, byCategory: spend, budgets };
  }

  /** Bills for a month with their status; a bill is due on its day each month. */
  billsFor(m = month()) {
    return this.db.bills.filter((b) => b.active !== false).map((b) => {
      const due = `${m}-${String(Math.min(b.dueDay, 28)).padStart(2, '0')}`;
      const paid = b.paid?.[m] || null;
      const days = Math.round((new Date(`${due}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
      return { ...b, due, paid, days, status: paid ? 'paid' : days < 0 ? 'overdue' : days <= 5 ? 'due soon' : 'upcoming' };
    }).sort((a, b) => a.due.localeCompare(b.due));
  }

  goalView(g) {
    const saved = g.contributions.reduce((s, c) => s + c.amount, 0);
    const byMember = {};
    for (const c of g.contributions) byMember[c.memberId] = (byMember[c.memberId] || 0) + c.amount;
    return { ...g, saved, pct: Math.min(100, Math.round((saved / g.target) * 100)), byMember };
  }

  summary() {
    const mv = this.monthView();
    const netWorth = this.db.accounts.reduce((s, a) => s + a.balance, 0);
    const bills = this.billsFor();
    return {
      month: mv.month,
      netWorth,
      income: mv.income, spent: mv.spent, saved: mv.saved,
      overBudget: mv.budgets.filter((b) => b.spent > b.limit).map((b) => b.category),
      bills: { due: bills.filter((b) => !b.paid).length, overdue: bills.filter((b) => b.status === 'overdue').length, next: bills.filter((b) => !b.paid).slice(0, 4) },
      goals: this.db.goals.map((g) => this.goalView(g)).map(({ contributions, ...rest }) => rest),
      requests: this.db.requests.filter((r) => r.status === 'pending'),
      members: this.db.members,
    };
  }

  // ---------- HTTP ----------

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/.well-known/larp-integration.json') return send(res, 200, manifest());
    if (!url.pathname.startsWith('/api/')) return false;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'kosh', members: this.db.members.length });
      if (url.pathname === '/api/session') {
        if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) fail(403, 'Not allowed');
        return send(res, 200, { token: this.db.token });
      }
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token || !safeEqual(token, this.db.token)) fail(401, 'Missing or wrong Kosh token');
      const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      return send(res, 200, await this.route(req.method, url.pathname.slice(5).split('/').filter(Boolean), body, url.searchParams));
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('[kosh]', error);
      return send(res, status, { error: status === 500 ? 'Something went wrong' : error.message });
    }
  }

  async route(method, [a, b, c], body, q) {
    const db = this.db;
    switch (`${method} ${a}${b ? '/:id' : ''}${c ? '/' + c : ''}`) {
      case 'GET summary': return this.summary();
      case 'GET family': return { members: db.members, accounts: db.accounts };
      case 'GET meta': return { expense: EXPENSE, income: INCOME, roles: ROLES, kinds: KINDS };
      case 'POST members': return this.saveMember(null, body);
      case 'PATCH members/:id': return this.saveMember(b, body);
      case 'DELETE members/:id': return this.removeMember(b);
      case 'POST accounts': return this.saveAccount(null, body);
      case 'PATCH accounts/:id': return this.saveAccount(b, body);

      case 'GET transactions': {
        const m = q.get('month');
        const list = db.transactions.filter((t) => (!m || month(t.date) === m) && (!q.get('memberId') || t.memberId === q.get('memberId')));
        return { transactions: list.sort((x, y) => (y.date + y.at).localeCompare(x.date + x.at)) };
      }
      case 'POST transactions': return this.addTransaction(body);
      case 'DELETE transactions/:id': return this.removeTransaction(b);

      case 'GET month': return this.monthView(q.get('month') || month());
      case 'POST budgets': {
        const category = EXPENSE.includes(body.category) ? body.category : fail(400, 'Unknown category');
        if (body.limit === null || body.limit === 0 || body.limit === '') delete db.budgets[category];
        else db.budgets[category] = rupees(body.limit, 'Budget');
        this.log(body.by, 'budget', db.budgets[category] ? `set the ${category} budget to ${inr(db.budgets[category])} a month` : `removed the ${category} budget`);
        await this.save(); return this.monthView();
      }

      case 'GET bills': return { bills: this.billsFor(q.get('month') || month()) };
      case 'POST bills': return this.saveBill(null, body);
      case 'PATCH bills/:id': return this.saveBill(b, body);
      case 'DELETE bills/:id': db.bills = db.bills.filter((x) => x.id !== b); await this.save(); return { ok: true };
      case 'POST bills/:id/claim': {
        const bill = db.bills.find((x) => x.id === b) || fail(404, 'Bill not found');
        this.member(body.by);
        bill.assigneeId = body.by;
        this.log(body.by, 'bill', `will pay ${bill.name} this month`, { billId: bill.id });
        await this.save(); return bill;
      }
      case 'POST bills/:id/pay': return this.payBill(b, body);

      case 'GET goals': return { goals: db.goals.map((g) => this.goalView(g)) };
      case 'POST goals': {
        const g = { id: id('gol'), name: str(body.name, 'Goal', 60), emoji: str(body.emoji, 'emoji', 8, true) || '🎯', target: rupees(body.target, 'Target'), by: body.by ? dateStr(body.by, 'Date') : null, contributions: [], createdAt: new Date().toISOString() };
        db.goals.push(g); this.log(body.createdBy, 'goal', `started saving for ${g.name} (${inr(g.target)})`, { goalId: g.id });
        await this.save(); return this.goalView(g);
      }
      case 'POST goals/:id/add': {
        const g = db.goals.find((x) => x.id === b) || fail(404, 'Goal not found');
        this.member(body.memberId);
        const amount = rupees(body.amount, 'Amount');
        const acc = body.accountId ? this.account(body.accountId) : null;
        if (acc) acc.balance -= amount;
        g.contributions.push({ memberId: body.memberId, amount, accountId: acc?.id || null, at: new Date().toISOString() });
        const view = this.goalView(g);
        this.log(body.memberId, 'goal', `added ${inr(amount)} to ${g.name}${view.pct >= 100 ? ', and it\'s complete! 🎉' : ` (${view.pct}%)`}`, { goalId: g.id, amount });
        await this.save(); return view;
      }
      case 'DELETE goals/:id': db.goals = db.goals.filter((x) => x.id !== b); await this.save(); return { ok: true };

      case 'GET requests': return { requests: db.requests.slice().reverse() };
      case 'POST requests': {
        const from = this.member(body.fromId);
        const r = { id: id('req'), fromId: from.id, amount: rupees(body.amount, 'Amount', { max: 1e6 }), reason: str(body.reason, 'Reason', 140), status: 'pending', at: new Date().toISOString() };
        db.requests.push(r); this.log(from.id, 'request', `asked for ${inr(r.amount)}: ${r.reason}`, { requestId: r.id });
        await this.save(); return r;
      }
      case 'POST requests/:id/decide': return this.decide(b, body);

      case 'GET activity': return { activity: db.activity.slice(-Number(q.get('limit') || 60)).reverse() };
      case 'POST sample': return this.loadSample();
      default: fail(404, 'Unknown endpoint');
    }
  }

  async saveMember(mid, b) {
    const existing = mid ? this.member(mid) : null;
    const m = existing || { id: id('mem'), color: COLORS[this.db.members.length % COLORS.length], createdAt: new Date().toISOString() };
    if (!existing || 'name' in b) m.name = str(b.name, 'Name', 40);
    if (!existing || 'role' in b) m.role = ROLES.includes(b.role) ? b.role : 'adult';
    if (!existing || 'allowance' in b) m.allowance = b.allowance ? rupees(b.allowance, 'Allowance', { max: 1e5 }) : null;
    m.canApprove = m.role === 'parent' || m.role === 'grandparent';
    if (!existing) { this.db.members.push(m); this.log(m.id, 'member', 'joined the family space'); }
    await this.save(); return m;
  }

  async removeMember(mid) {
    this.member(mid);
    this.db.members = this.db.members.filter((m) => m.id !== mid);
    for (const a of this.db.accounts) if (a.ownerId === mid) a.ownerId = null;
    await this.save(); return { ok: true };
  }

  async saveAccount(aid, b) {
    const existing = aid ? this.account(aid) : null;
    const a = existing || { id: id('acc'), createdAt: new Date().toISOString() };
    if (!existing || 'name' in b) a.name = str(b.name, 'Account name', 40);
    if (!existing || 'kind' in b) a.kind = KINDS.includes(b.kind) ? b.kind : 'bank';
    if (!existing || 'ownerId' in b) a.ownerId = b.ownerId ? this.member(b.ownerId).id : null;
    if (!existing || 'balance' in b) a.balance = rupees(b.balance ?? 0, 'Balance', { min: -1e9 });
    if (!existing) this.db.accounts.push(a);
    await this.save(); return a;
  }

  async addTransaction(b, { silent = false } = {}) {
    const type = ['expense', 'income', 'transfer'].includes(b.type) ? b.type : fail(400, 'type must be expense, income or transfer');
    const t = { id: id('txn'), type, amount: rupees(b.amount, 'Amount'), date: b.date ? dateStr(b.date, 'Date') : today(), note: str(b.note, 'Note', 140, true), memberId: b.memberId ? this.member(b.memberId).id : null, at: new Date().toISOString() };
    const acc = this.account(b.accountId);
    t.accountId = acc.id;
    if (type === 'transfer') {
      const to = this.account(b.toAccountId);
      if (to.id === acc.id) fail(400, 'Choose two different accounts');
      t.toAccountId = to.id; t.category = 'Transfer';
      acc.balance -= t.amount; to.balance += t.amount;
    } else {
      t.category = (type === 'expense' ? EXPENSE : INCOME).includes(b.category) ? b.category : fail(400, 'Unknown category');
      acc.balance += type === 'income' ? t.amount : -t.amount;
    }
    // Split an expense between family members (shares in rupees; must add up to the amount).
    if (type === 'expense' && Array.isArray(b.split) && b.split.length) {
      t.split = b.split.map((s) => ({ memberId: this.member(s.memberId).id, share: rupees(s.share, 'Share', { min: 0 }) }));
      if (t.split.reduce((s, x) => s + x.share, 0) !== t.amount) fail(400, 'The shares must add up to the amount');
    }
    this.db.transactions.push(t);
    if (!silent) {
      const verb = type === 'income' ? `added ${inr(t.amount)} ${t.category.toLowerCase()}` : type === 'transfer' ? `moved ${inr(t.amount)} from ${acc.name} to ${this.account(t.toAccountId).name}` : `spent ${inr(t.amount)} on ${t.category.toLowerCase()}`;
      this.log(t.memberId, type, `${verb}${t.note ? `: ${t.note}` : ''}${t.split ? `, split ${t.split.length} ways` : ''}`, { transactionId: t.id });
      // A gentle nudge when a budget tips over.
      if (type === 'expense' && this.db.budgets[t.category]) {
        const mv = this.monthView(month(t.date));
        const bud = mv.budgets.find((x) => x.category === t.category);
        if (bud && bud.spent > bud.limit && bud.spent - t.amount <= bud.limit) this.log(null, 'alert', `${t.category} went over its ${inr(bud.limit)} budget for the month`);
      }
      await this.save();
    }
    return t;
  }

  async removeTransaction(tid) {
    const t = this.db.transactions.find((x) => x.id === tid) || fail(404, 'Transaction not found');
    const acc = this.db.accounts.find((a) => a.id === t.accountId);
    if (t.type === 'transfer') { if (acc) acc.balance += t.amount; const to = this.db.accounts.find((a) => a.id === t.toAccountId); if (to) to.balance -= t.amount; }
    else if (acc) acc.balance += t.type === 'income' ? -t.amount : t.amount;
    this.db.transactions = this.db.transactions.filter((x) => x.id !== tid);
    await this.save(); return { ok: true };
  }

  async saveBill(bid, b) {
    const existing = bid ? this.db.bills.find((x) => x.id === bid) || fail(404, 'Bill not found') : null;
    const bill = existing || { id: id('bil'), paid: {}, createdAt: new Date().toISOString() };
    if (!existing || 'name' in b) bill.name = str(b.name, 'Bill', 60);
    if (!existing || 'amount' in b) bill.amount = rupees(b.amount, 'Amount');
    if (!existing || 'dueDay' in b) { const d = Number(b.dueDay); if (!(d >= 1 && d <= 31)) fail(400, 'Due day must be 1–31'); bill.dueDay = d; }
    if (!existing || 'category' in b) bill.category = EXPENSE.includes(b.category) ? b.category : 'Utilities';
    if (!existing || 'accountId' in b) bill.accountId = b.accountId ? this.account(b.accountId).id : null;
    if (!existing || 'assigneeId' in b) bill.assigneeId = b.assigneeId ? this.member(b.assigneeId).id : null;
    if (!existing) { this.db.bills.push(bill); this.log(b.by, 'bill', `added the ${bill.name} bill (${inr(bill.amount)} on the ${bill.dueDay}${ordinal(bill.dueDay)})`); }
    await this.save(); return bill;
  }

  async payBill(bid, body) {
    const bill = this.db.bills.find((x) => x.id === bid) || fail(404, 'Bill not found');
    const m = body.month || month();
    if (bill.paid?.[m]) fail(409, `${bill.name} is already paid for this month`);
    const by = this.member(body.by);
    const amount = rupees(body.amount ?? bill.amount, 'Amount');
    const accountId = body.accountId || bill.accountId || this.db.accounts[0]?.id || fail(400, 'Add an account first');
    const t = await this.addTransaction({ type: 'expense', amount, category: bill.category, accountId, memberId: by.id, note: bill.name, date: today() }, { silent: true });
    bill.paid = { ...(bill.paid || {}), [m]: { by: by.id, at: new Date().toISOString(), amount, transactionId: t.id } };
    this.log(by.id, 'bill', `paid ${bill.name} (${inr(amount)})`, { billId: bill.id });
    await this.save(); return { ...bill, transaction: t };
  }

  /** A parent (or grandparent) answers a money request; approving moves the money into the asker's account. */
  async decide(rid, { by, decision, fromAccountId, note }) {
    const r = this.db.requests.find((x) => x.id === rid) || fail(404, 'Request not found');
    if (r.status !== 'pending') fail(409, 'This request was already answered');
    const approver = this.member(by);
    if (!approver.canApprove) fail(403, `${approver.name} can't approve money requests`);
    if (approver.id === r.fromId) fail(403, 'Someone else has to approve your own request');
    r.status = decision === 'approve' ? 'approved' : 'declined';
    r.decidedBy = approver.id; r.decidedAt = new Date().toISOString(); r.note = str(note, 'note', 140, true);
    if (r.status === 'approved') {
      const from = fromAccountId ? this.account(fromAccountId) : this.db.accounts.find((a) => a.ownerId === approver.id) || this.db.accounts.find((a) => !a.ownerId);
      const to = this.db.accounts.find((a) => a.ownerId === r.fromId);
      if (!from) fail(400, 'Choose which account the money comes from');
      if (to && to.id !== from.id) {
        await this.addTransaction({ type: 'transfer', amount: r.amount, accountId: from.id, toAccountId: to.id, memberId: approver.id, note: `${this.name(r.fromId)}: ${r.reason}` }, { silent: true });
      } else {
        await this.addTransaction({ type: 'expense', amount: r.amount, category: 'Pocket money', accountId: from.id, memberId: r.fromId, note: r.reason }, { silent: true });
      }
    }
    this.log(approver.id, 'request', `${r.status} ${this.name(r.fromId)}'s request for ${inr(r.amount)}${r.note ? ` (“${r.note}”)` : ''}`, { requestId: r.id });
    await this.save(); return r;
  }

  async loadSample() {
    if (this.db.members.length) fail(409, 'Sample data only loads into an empty family');
    const add = (b) => this.saveMember(null, b);
    const ravi = await add({ name: 'Ravi', role: 'parent' });
    const anita = await add({ name: 'Anita', role: 'parent' });
    const dadi = await add({ name: 'Dadi', role: 'grandparent' });
    const aarav = await add({ name: 'Aarav', role: 'child', allowance: 1000 });
    const isha = await add({ name: 'Isha', role: 'child', allowance: 500 });
    const acc = (b) => this.saveAccount(null, b);
    const joint = await acc({ name: 'HDFC joint savings', kind: 'savings', balance: 184200 });
    const sbi = await acc({ name: 'Ravi · SBI salary', kind: 'bank', ownerId: ravi.id, balance: 62400 });
    const upi = await acc({ name: 'Anita · UPI', kind: 'upi', ownerId: anita.id, balance: 18750 });
    const cash = await acc({ name: 'Cash at home', kind: 'cash', balance: 6500 });
    const card = await acc({ name: 'Credit card', kind: 'card', ownerId: ravi.id, balance: -12400 });
    await acc({ name: 'Dadi · pension', kind: 'bank', ownerId: dadi.id, balance: 41300 });
    await acc({ name: 'Aarav · wallet', kind: 'upi', ownerId: aarav.id, balance: 850 });
    await acc({ name: 'Isha · piggy bank', kind: 'cash', ownerId: isha.id, balance: 420 });
    this.db.budgets = { Groceries: 18000, 'Dining out': 5000, Shopping: 8000, Transport: 6000, Entertainment: 3000, Utilities: 7000, 'Festivals & gifts': 10000 };
    // Six weeks of everyday life, so the month and its budgets have a shape.
    const spend = [['Groceries', 2850, upi, anita, 'BigBasket weekly'], ['Groceries', 640, cash, dadi, 'Sabzi mandi'], ['Transport', 1800, card, ravi, 'Petrol'], ['Dining out', 1450, card, ravi, 'Sunday lunch'], ['Shopping', 2399, upi, anita, 'School shoes'], ['Entertainment', 799, card, ravi, 'Movie night'], ['Health', 1250, upi, dadi, 'Medicines'], ['Groceries', 3120, upi, anita, 'Monthly ration'], ['Dining out', 680, upi, aarav, 'Pizza with friends'], ['Transport', 420, upi, anita, 'Auto & metro'], ['Festivals & gifts', 3500, card, ravi, 'Gift for Meera\'s wedding'], ['Shopping', 4890, card, anita, 'Diwali clothes'], ['Groceries', 2210, upi, anita, 'BigBasket weekly'], ['Dining out', 2100, card, ravi, 'Anniversary dinner']];
    let day = 40;
    for (const [category, amount, account, who, note] of spend) {
      day -= 3;
      await this.addTransaction({ type: 'expense', category, amount, accountId: account.id, memberId: who.id, note, date: new Date(Date.now() - day * 86400000).toISOString().slice(0, 10) }, { silent: true });
    }
    const first = `${month()}-01`;
    await this.addTransaction({ type: 'income', category: 'Salary', amount: 145000, accountId: sbi.id, memberId: ravi.id, note: 'October salary', date: first }, { silent: true });
    await this.addTransaction({ type: 'income', category: 'Business', amount: 38000, accountId: upi.id, memberId: anita.id, note: 'Tuition classes', date: first }, { silent: true });
    await this.addTransaction({ type: 'income', category: 'Interest', amount: 9200, accountId: joint.id, memberId: dadi.id, note: 'FD interest', date: first }, { silent: true });
    const bill = (b) => this.saveBill(null, b);
    const rent = await bill({ name: 'Rent', amount: 28000, dueDay: 1, category: 'Rent & home', accountId: joint.id, assigneeId: ravi.id });
    await bill({ name: 'Maid', amount: 6000, dueDay: 1, category: 'Rent & home', accountId: cash.id, assigneeId: anita.id });
    await bill({ name: 'Broadband', amount: 999, dueDay: 5, category: 'Utilities', accountId: upi.id });
    await bill({ name: 'Car EMI', amount: 14500, dueDay: 7, category: 'EMI & loans', accountId: sbi.id, assigneeId: ravi.id });
    await bill({ name: 'Electricity', amount: 2400, dueDay: 12, category: 'Utilities', accountId: upi.id, assigneeId: anita.id });
    await bill({ name: 'Aarav\'s tuition', amount: 4500, dueDay: 15, category: 'Education', accountId: upi.id });
    await bill({ name: 'Mutual fund SIP', amount: 10000, dueDay: 20, category: 'Other', accountId: sbi.id, assigneeId: ravi.id });
    // Bills already past their day this month are paid, except one left overdue to show what that looks like.
    const dayNow = new Date().getDate();
    for (const b of this.db.bills) if (b.dueDay < dayNow - 2 && b.name !== "Aarav's tuition") await this.payBill(b.id, { by: b.assigneeId || anita.id });
    if (!rent.paid?.[month()]) await this.payBill(rent.id, { by: ravi.id });
    const goal = async (name, emoji, target, by, adds) => {
      const g = { id: id('gol'), name, emoji, target, by, contributions: [], createdAt: new Date().toISOString() };
      this.db.goals.push(g);
      for (const [m, amount] of adds) g.contributions.push({ memberId: m.id, amount, at: new Date().toISOString() });
    };
    const y = new Date().getFullYear();
    await goal('Goa trip', '🏖️', 80000, `${y}-12-20`, [[ravi, 25000], [anita, 18000], [dadi, 5000], [aarav, 600]]);
    await goal('Diwali', '🪔', 25000, `${y}-11-01`, [[anita, 12000], [ravi, 8000]]);
    await goal('Aarav\'s laptop', '💻', 60000, `${y + 1}-03-31`, [[ravi, 15000], [aarav, 2400], [dadi, 5000]]);
    await goal('Emergency fund', '🛟', 300000, null, [[ravi, 110000], [anita, 45000]]);
    this.db.requests.push({ id: id('req'), fromId: aarav.id, amount: 1200, reason: 'Cricket bat for the school team', status: 'pending', at: new Date(Date.now() - 3600_000).toISOString() });
    this.db.requests.push({ id: id('req'), fromId: isha.id, amount: 300, reason: 'Art supplies', status: 'approved', decidedBy: anita.id, at: new Date(Date.now() - 2 * 86400000).toISOString(), decidedAt: new Date(Date.now() - 2 * 86400000 + 1800_000).toISOString() });
    this.log(isha.id, 'request', 'asked for ₹300: Art supplies');
    this.log(anita.id, 'request', 'approved Isha\'s request for ₹300');
    this.log(anita.id, 'expense', 'spent ₹2,210 on groceries: BigBasket weekly');
    this.log(ravi.id, 'bill', 'paid Rent (₹28,000)');
    this.log(dadi.id, 'goal', 'added ₹5,000 to Goa trip (61%)');
    this.log(aarav.id, 'request', 'asked for ₹1,200: Cricket bat for the school team');
    await this.save();
    return { ok: true, sample: true };
  }
}

const ordinal = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

function manifest() {
  return {
    name: 'Kosh', id: 'kosh', version: '0.1.0', kind: 'finance',
    description: 'Family finance: accounts, budgets, bills, savings goals and money requests. Data stays on the owner\'s computer.',
    auth: { type: 'bearer', obtain: 'Kosh → Connect to Larp' },
    endpoints: [
      { method: 'GET', path: '/api/summary', scope: 'finance.summary', shares: 'This month\'s income, spending, bills due, goals and pending requests' },
      { method: 'GET', path: '/api/bills', scope: 'finance.bills', shares: 'Recurring bills with due dates and who pays them' },
      { method: 'POST', path: '/api/bills/{id}/pay', scope: 'finance.bills.write', shares: 'Marks a bill paid and records the payment' },
      { method: 'GET', path: '/api/month', scope: 'finance.budgets', shares: 'Spending by category against the family\'s budgets' },
      { method: 'GET', path: '/api/goals', scope: 'finance.goals', shares: 'Savings goals and how far along they are' },
      { method: 'POST', path: '/api/requests', scope: 'finance.requests.write', shares: 'Asks the family for money (a parent approves)' },
      { method: 'GET', path: '/api/activity', scope: 'finance.activity', shares: 'The family money feed' },
    ],
  };
}

function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); return true; }
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) fail(413, 'Too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid JSON'); }
}
function safeEqual(a, b) { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

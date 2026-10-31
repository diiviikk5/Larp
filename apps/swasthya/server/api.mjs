// Swasthya's API: the family's health records, kept in one JSON file on this computer.
// The web app, Larp and any other client use the same endpoints with a bearer token.
// The token is created on first run; the web app gets it from /api/session, which only
// answers same-origin requests, and Larp is given it once when you connect the two.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const id = (p) => `${p}_${crypto.randomBytes(5).toString('hex')}`;
const today = () => new Date().toISOString().slice(0, 10);
const MAX_BODY = 200_000;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const str = (v, name, max = 200, optional = false) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; fail(400, `${name} is required`); }
  if (typeof v !== 'string' || v.length > max) fail(400, `${name} is invalid`);
  return v.trim();
};
const num = (v, name, min, max, optional = false) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; fail(400, `${name} is required`); }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${name} must be between ${min} and ${max}`);
  return n;
};
const dateStr = (v, name, optional = false) => {
  if (!v && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) fail(400, `${name} must be YYYY-MM-DD`);
  return v;
};
const timeStr = (v, name) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) fail(400, `${name} must be HH:MM`); return v; };

const COLORS = ['#f2a65a', '#7fb48a', '#8fb3e0', '#d98fa8', '#c9b27c', '#a89be0'];

/** General adult reference ranges, used only to highlight readings worth a second look. Not a diagnosis. */
export const VITALS = {
  bp: { label: 'Blood pressure', unit: 'mmHg', check: (v) => (v.systolic >= 140 || v.diastolic >= 90 ? 'high' : v.systolic < 90 || v.diastolic < 60 ? 'low' : 'ok') },
  sugar: { label: 'Blood sugar', unit: 'mg/dL', check: (v, ctx) => (v.value > (ctx === 'fasting' ? 125 : 199) ? 'high' : v.value < 70 ? 'low' : 'ok') },
  pulse: { label: 'Pulse', unit: 'bpm', check: (v) => (v.value > 100 ? 'high' : v.value < 50 ? 'low' : 'ok') },
  temp: { label: 'Temperature', unit: '°F', check: (v) => (v.value >= 100.4 ? 'high' : v.value < 95 ? 'low' : 'ok') },
  spo2: { label: 'Oxygen (SpO₂)', unit: '%', check: (v) => (v.value < 94 ? 'low' : 'ok') },
  weight: { label: 'Weight', unit: 'kg', check: () => 'ok' },
};

function empty() {
  return { version: 1, token: crypto.randomBytes(24).toString('base64url'), members: [], medications: [], doses: [], vitals: [], appointments: [], symptoms: [], joy: [], createdAt: new Date().toISOString() };
}

export class Swasthya {
  constructor({ dataDir, geminiKey, geminiModel = 'gemini-2.0-flash' }) {
    this.file = path.join(dataDir, 'swasthya.json');
    this.geminiKey = geminiKey || null;
    this.geminiModel = geminiModel;
    this.writing = Promise.resolve();
  }

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

  member(memberId) { return this.db.members.find((m) => m.id === memberId) || fail(404, 'Family member not found'); }

  // ---------- derived views ----------

  /** Every scheduled dose for a day, with whether it was taken, skipped or is still due. */
  dosesFor(day = today()) {
    const out = [];
    for (const med of this.db.medications) {
      if (med.active === false || (med.startDate && med.startDate > day) || (med.endDate && med.endDate < day)) continue;
      for (const time of med.times) {
        const log = this.db.doses.find((d) => d.medicationId === med.id && d.date === day && d.time === time);
        out.push({ medicationId: med.id, memberId: med.memberId, name: med.name, dose: med.dose, instructions: med.instructions, date: day, time, status: log?.status || 'due', at: log?.at || null });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }

  adherence(memberId, days = 7) {
    let due = 0; let taken = 0;
    for (let i = 1; i <= days; i++) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      for (const d of this.dosesFor(day)) if (!memberId || d.memberId === memberId) { due++; if (d.status === 'taken') taken++; }
    }
    return due ? Math.round((taken / due) * 100) : null;
  }

  flags() {
    const out = [];
    for (const m of this.db.members) {
      const latest = {};
      for (const v of this.db.vitals.filter((x) => x.memberId === m.id)) if (!latest[v.type] || v.at > latest[v.type].at) latest[v.type] = v;
      for (const v of Object.values(latest)) if (v.flag && v.flag !== 'ok') out.push({ kind: 'vital', memberId: m.id, text: `${m.name}'s ${VITALS[v.type].label.toLowerCase()} was ${v.flag} (${formatVital(v)})`, at: v.at });
    }
    for (const d of this.dosesFor()) {
      const [h, mi] = d.time.split(':').map(Number);
      const due = new Date(); due.setHours(h, mi, 0, 0);
      if (d.status === 'due' && Date.now() - due.getTime() > 2 * 3600_000) out.push({ kind: 'dose', memberId: d.memberId, text: `${this.db.members.find((x) => x.id === d.memberId)?.name}: ${d.name} at ${d.time} not marked yet`, at: due.toISOString() });
    }
    return out;
  }

  summary(day = today()) {
    const doses = this.dosesFor(day);
    const upcoming = this.db.appointments.filter((a) => a.date >= day && a.status !== 'cancelled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5);
    return {
      date: day,
      members: this.db.members.map((m) => ({ id: m.id, name: m.name, relation: m.relation, color: m.color, adherence: this.adherence(m.id) })),
      doses: { total: doses.length, taken: doses.filter((d) => d.status === 'taken').length, due: doses.filter((d) => d.status === 'due').length, items: doses },
      upcoming,
      flags: this.flags(),
      adherence: this.adherence(),
    };
  }

  /** Appointment windows for a day with no details: enough for someone to plan around them. */
  busy(day) {
    return this.db.appointments.filter((a) => a.date === day && a.status !== 'cancelled').map((a) => {
      const [h, m] = a.time.split(':').map(Number);
      const end = h * 60 + m + (a.durationMin || 60);
      return { from: a.time, to: `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` };
    });
  }

  emergency(memberId) {
    const m = this.member(memberId);
    return {
      name: m.name, age: m.birthYear ? new Date().getFullYear() - m.birthYear : null, bloodGroup: m.bloodGroup, allergies: m.allergies, conditions: m.conditions,
      medications: this.db.medications.filter((x) => x.memberId === m.id && x.active !== false).map((x) => `${x.name} ${x.dose}`.trim()),
      emergencyContact: m.emergencyContact, doctor: m.doctor,
    };
  }

  // ---------- HTTP ----------

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/.well-known/larp-integration.json') return send(res, 200, manifest());
    if (!url.pathname.startsWith('/api/')) return false;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'swasthya', members: this.db.members.length });
      if (url.pathname === '/api/session') {
        // Same-origin only: a page on another site can't read this response (no CORS), and
        // Sec-Fetch-Site lets us refuse cross-site requests outright where browsers send it.
        if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) fail(403, 'Not allowed');
        return send(res, 200, { token: this.db.token });
      }
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token || !safeEqual(token, this.db.token)) fail(401, 'Missing or wrong Swasthya token');
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const result = await this.route(req.method, url.pathname.slice(5).split('/').filter(Boolean), body, url.searchParams);
      return send(res, 200, result);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error('[swasthya]', error);
      return send(res, status, { error: status === 500 ? 'Something went wrong' : error.message });
    }
  }

  async route(method, [a, b, c], body, q) {
    const key = `${method} ${a}${b ? '/:id' : ''}${c ? '/' + c : ''}`;
    const db = this.db;
    switch (key) {
      case 'GET family': return { members: db.members };
      case 'POST members': return this.saveMember(null, body);
      case 'PATCH members/:id': return this.saveMember(b, body);
      case 'DELETE members/:id': return this.removeMember(b);
      case 'GET members/:id': {
        const m = this.member(b);
        return { member: m, medications: db.medications.filter((x) => x.memberId === b), vitals: db.vitals.filter((x) => x.memberId === b).sort((x, y) => x.at.localeCompare(y.at)), appointments: db.appointments.filter((x) => x.memberId === b), symptoms: db.symptoms.filter((x) => x.memberId === b), adherence: this.adherence(b) };
      }
      case 'GET members/:id/emergency': return this.emergency(b);

      case 'GET medications': return { medications: db.medications };
      case 'POST medications': return this.saveMedication(null, body);
      case 'PATCH medications/:id': return this.saveMedication(b, body);
      case 'DELETE medications/:id': db.medications = db.medications.filter((x) => x.id !== b); await this.save(); return { ok: true };

      case 'GET doses': return { doses: this.dosesFor(q.get('date') ? dateStr(q.get('date'), 'date') : today()) };
      case 'POST doses': {
        const med = db.medications.find((x) => x.id === body.medicationId) || fail(404, 'Medicine not found');
        const date = dateStr(body.date || today(), 'date');
        const time = timeStr(body.time, 'time');
        if (!med.times.includes(time)) fail(400, 'That time is not on this medicine\'s schedule');
        const status = ['taken', 'skipped', 'due'].includes(body.status) ? body.status : fail(400, 'status must be taken, skipped or due');
        db.doses = db.doses.filter((d) => !(d.medicationId === med.id && d.date === date && d.time === time));
        if (status !== 'due') db.doses.push({ medicationId: med.id, date, time, status, at: new Date().toISOString(), by: str(body.by, 'by', 60, true) });
        await this.save();
        return { ok: true, doses: this.dosesFor(date) };
      }

      case 'GET vitals': return { vitals: db.vitals.filter((v) => (!q.get('memberId') || v.memberId === q.get('memberId')) && (!q.get('type') || v.type === q.get('type'))) };
      case 'POST vitals': {
        this.member(body.memberId);
        const type = VITALS[body.type] ? body.type : fail(400, 'Unknown vital');
        const v = type === 'bp'
          ? { systolic: num(body.systolic, 'Systolic', 50, 260), diastolic: num(body.diastolic, 'Diastolic', 30, 180) }
          : { value: num(body.value, 'Value', 0, type === 'weight' ? 400 : type === 'sugar' ? 700 : 250) };
        const context = str(body.context, 'context', 20, true);
        const entry = { id: id('vit'), memberId: body.memberId, type, ...v, context, note: str(body.note, 'note', 300, true), at: body.at || new Date().toISOString() };
        entry.flag = VITALS[type].check(v, context);
        db.vitals.push(entry);
        await this.save();
        return entry;
      }
      case 'DELETE vitals/:id': db.vitals = db.vitals.filter((x) => x.id !== b); await this.save(); return { ok: true };

      case 'GET appointments': return { appointments: db.appointments.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)) };
      case 'POST appointments': return this.saveAppointment(null, body);
      case 'PATCH appointments/:id': return this.saveAppointment(b, body);
      case 'DELETE appointments/:id': db.appointments = db.appointments.filter((x) => x.id !== b); await this.save(); return { ok: true };

      case 'GET symptoms': return { symptoms: db.symptoms.slice().reverse() };
      case 'POST symptoms': {
        this.member(body.memberId);
        const s = { id: id('sym'), memberId: body.memberId, name: str(body.name, 'Symptom', 80), severity: ['mild', 'moderate', 'severe'].includes(body.severity) ? body.severity : 'mild', note: str(body.note, 'note', 500, true), at: new Date().toISOString() };
        db.symptoms.push(s); await this.save(); return s;
      }
      case 'DELETE symptoms/:id': db.symptoms = db.symptoms.filter((x) => x.id !== b); await this.save(); return { ok: true };

      case 'GET joy': return { joy: db.joy.slice().reverse() };
      case 'POST joy': {
        const j = { id: id('joy'), memberId: body.memberId || null, category: str(body.category, 'Category', 40), intensity: num(body.intensity, 'Intensity', 1, 10), note: str(body.note, 'note', 300, true), at: new Date().toISOString() };
        db.joy.push(j); await this.save(); return j;
      }

      case 'GET summary': return this.summary(q.get('date') ? dateStr(q.get('date'), 'date') : today());
      case 'GET busy': return { day: dateStr(q.get('day'), 'day'), windows: this.busy(q.get('day')) };
      case 'POST budh': return this.budh(body);
      case 'POST sample': return this.loadSample();
      default: fail(404, 'Unknown endpoint');
    }
  }

  async saveMember(memberId, b) {
    const existing = memberId ? this.member(memberId) : null;
    const m = existing || { id: id('mem'), color: COLORS[this.db.members.length % COLORS.length], createdAt: new Date().toISOString() };
    if (!existing || 'name' in b) m.name = str(b.name, 'Name', 60);
    for (const k of ['relation', 'bloodGroup', 'doctor', 'emergencyContact']) if (!existing || k in b) m[k] = str(b[k], k, 120, true);
    if (!existing || 'birthYear' in b) m.birthYear = num(b.birthYear, 'Birth year', 1900, new Date().getFullYear(), true);
    for (const k of ['allergies', 'conditions']) if (!existing || k in b) m[k] = (Array.isArray(b[k]) ? b[k] : String(b[k] || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
    if (!existing) this.db.members.push(m);
    await this.save();
    return m;
  }

  async removeMember(memberId) {
    this.member(memberId);
    const db = this.db;
    const meds = new Set(db.medications.filter((x) => x.memberId === memberId).map((x) => x.id));
    db.members = db.members.filter((x) => x.id !== memberId);
    db.medications = db.medications.filter((x) => x.memberId !== memberId);
    db.doses = db.doses.filter((x) => !meds.has(x.medicationId));
    for (const k of ['vitals', 'appointments', 'symptoms', 'joy']) db[k] = db[k].filter((x) => x.memberId !== memberId);
    await this.save();
    return { ok: true };
  }

  async saveMedication(medId, b) {
    const existing = medId ? this.db.medications.find((x) => x.id === medId) || fail(404, 'Medicine not found') : null;
    const m = existing || { id: id('med'), active: true, createdAt: new Date().toISOString() };
    if (!existing || 'memberId' in b) { this.member(b.memberId); m.memberId = b.memberId; }
    if (!existing || 'name' in b) m.name = str(b.name, 'Medicine', 80);
    for (const k of ['dose', 'instructions']) if (!existing || k in b) m[k] = str(b[k], k, 120, true);
    if (!existing || 'times' in b) {
      const times = (Array.isArray(b.times) ? b.times : String(b.times || '').split(',')).map((t) => String(t).trim()).filter(Boolean);
      if (!times.length) fail(400, 'Add at least one time');
      m.times = [...new Set(times.map((t) => timeStr(t, 'time')))].sort();
    }
    for (const k of ['startDate', 'endDate']) if (!existing || k in b) m[k] = dateStr(b[k], k, true);
    if ('active' in b) m.active = Boolean(b.active);
    if (!existing) this.db.medications.push(m);
    await this.save();
    return m;
  }

  async saveAppointment(apptId, b) {
    const existing = apptId ? this.db.appointments.find((x) => x.id === apptId) || fail(404, 'Appointment not found') : null;
    const a = existing || { id: id('apt'), status: 'scheduled', createdAt: new Date().toISOString() };
    if (!existing || 'memberId' in b) { this.member(b.memberId); a.memberId = b.memberId; }
    if (!existing || 'title' in b) a.title = str(b.title, 'Title', 100);
    for (const k of ['doctor', 'place', 'note']) if (!existing || k in b) a[k] = str(b[k], k, 200, true);
    if (!existing || 'date' in b) a.date = dateStr(b.date, 'Date');
    if (!existing || 'time' in b) a.time = timeStr(b.time, 'Time');
    if (!existing || 'durationMin' in b) a.durationMin = num(b.durationMin ?? 60, 'Duration', 5, 600);
    if ('status' in b) a.status = ['scheduled', 'done', 'cancelled'].includes(b.status) ? b.status : fail(400, 'Bad status');
    if (!existing) this.db.appointments.push(a);
    await this.save();
    return a;
  }

  /** Budh, the wellness guide: Gemini through this server, so the key never reaches the browser. */
  async budh({ messages }) {
    if (!this.geminiKey) fail(503, 'Budh needs GEMINI_API_KEY in .env');
    if (!Array.isArray(messages) || !messages.length) fail(400, 'messages required');
    const family = this.db.members.map((m) => `${m.name} (${m.relation || 'family'}${m.birthYear ? `, ${new Date().getFullYear() - m.birthYear}y` : ''}${m.conditions?.length ? `, ${m.conditions.join('/')}` : ''})`).join('; ');
    const system = `${BUDH_PROMPT}\n\nThe family using this app: ${family || 'not set up yet'}. Use this only when relevant.`;
    const contents = messages.slice(-12).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text).slice(0, 4000) }] }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.geminiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 700, temperature: 0.6 } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) fail(502, data.error?.message || `Gemini returned ${response.status}`);
    return { text: data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'I could not form an answer this time.' };
  }

  async loadSample() {
    if (this.db.members.length) fail(409, 'Sample data only loads into an empty family');
    const y = new Date().getFullYear();
    const add = (b) => this.saveMember(null, b);
    const dadi = await add({ name: 'Dadi', relation: 'Grandmother', birthYear: y - 74, bloodGroup: 'B+', conditions: 'Hypertension, Type 2 diabetes', allergies: 'Penicillin', doctor: 'Dr. Mehra, City Clinic', emergencyContact: 'Ravi (son)' });
    const papa = await add({ name: 'Ravi', relation: 'Father', birthYear: y - 48, bloodGroup: 'O+', conditions: 'High cholesterol', doctor: 'Dr. Mehra, City Clinic', emergencyContact: 'Anita (wife)' });
    const maa = await add({ name: 'Anita', relation: 'Mother', birthYear: y - 45, bloodGroup: 'A+', conditions: 'Hypothyroidism', emergencyContact: 'Ravi (husband)' });
    const kid = await add({ name: 'Aarav', relation: 'Son', birthYear: y - 9, bloodGroup: 'O+', allergies: 'Peanuts', doctor: 'Dr. Kapoor, Children\'s Care', emergencyContact: 'Anita (mother)' });
    const med = (b) => this.saveMedication(null, b);
    const amlo = await med({ memberId: dadi.id, name: 'Amlodipine', dose: '5 mg', times: ['08:00'], instructions: 'After breakfast' });
    const met = await med({ memberId: dadi.id, name: 'Metformin', dose: '500 mg', times: ['08:30', '20:30'], instructions: 'With meals' });
    const ator = await med({ memberId: papa.id, name: 'Atorvastatin', dose: '10 mg', times: ['21:30'], instructions: 'At night' });
    const thy = await med({ memberId: maa.id, name: 'Levothyroxine', dose: '50 mcg', times: ['06:30'], instructions: 'Empty stomach' });
    await med({ memberId: kid.id, name: 'Vitamin D drops', dose: '400 IU', times: ['09:00'] });
    // A week of history so trends and adherence have something to show.
    for (let i = 7; i >= 1; i--) {
      const day = new Date(Date.now() - i * 86400000);
      const d = day.toISOString().slice(0, 10);
      for (const [m, t] of [[amlo, '08:00'], [met, '08:30'], [met, '20:30'], [ator, '21:30'], [thy, '06:30']]) {
        if (!(i === 3 && m === met && t === '20:30') && !(i === 5 && m === ator)) this.db.doses.push({ medicationId: m.id, date: d, time: t, status: 'taken', at: day.toISOString() });
      }
      const at = new Date(day.setHours(8, 15)).toISOString();
      this.db.vitals.push({ id: id('vit'), memberId: dadi.id, type: 'bp', systolic: 128 + ((i * 7) % 15), diastolic: 80 + ((i * 3) % 8), at, flag: 'ok' });
      this.db.vitals.push({ id: id('vit'), memberId: dadi.id, type: 'sugar', value: 108 + ((i * 11) % 22), context: 'fasting', at, flag: 'ok' });
      this.db.vitals.push({ id: id('vit'), memberId: papa.id, type: 'weight', value: 82 - i * 0.2, at, flag: 'ok' });
    }
    const late = { id: id('vit'), memberId: dadi.id, type: 'bp', systolic: 146, diastolic: 92, at: new Date().toISOString() };
    late.flag = VITALS.bp.check(late); this.db.vitals.push(late);
    const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    await this.saveAppointment(null, { memberId: dadi.id, title: 'Diabetes follow-up', doctor: 'Dr. Mehra', place: 'City Clinic', date: inDays(2), time: '11:00', durationMin: 60 });
    await this.saveAppointment(null, { memberId: kid.id, title: 'Annual check-up', doctor: 'Dr. Kapoor', place: 'Children\'s Care', date: inDays(6), time: '17:30', durationMin: 45 });
    await this.saveAppointment(null, { memberId: maa.id, title: 'Thyroid blood test', place: 'Path Lab', date: inDays(9), time: '08:00', durationMin: 30 });
    this.db.symptoms.push({ id: id('sym'), memberId: kid.id, name: 'Runny nose', severity: 'mild', at: new Date(Date.now() - 86400000).toISOString() });
    await this.save();
    return { ok: true, members: this.db.members.length, sample: true };
  }
}

const BUDH_PROMPT = `You are Budh, the wellness guide inside Swasthya, a family health app. You blend Ayurveda, yoga and mindful living with modern, evidence-based health guidance, and you speak warmly and plainly.
- Keep answers short and practical: a few sentences or a short list.
- Be clear about what is traditional wisdom and what is medical evidence.
- You are not a doctor. Never diagnose, never change or stop someone's prescribed medicine, and never give doses.
- For chest pain, trouble breathing, fainting, stroke signs, severe bleeding, high fever in an infant or thoughts of self-harm, tell them to get emergency help right away (India: 112).`;

export function formatVital(v) {
  if (v.type === 'bp') return `${v.systolic}/${v.diastolic} ${VITALS.bp.unit}`;
  return `${v.value} ${VITALS[v.type].unit}`;
}

/** What Larp (or any agent harness) needs to connect: endpoints and what each one shares. */
function manifest() {
  return {
    name: 'Swasthya', id: 'swasthya', version: '1.0.0', kind: 'health',
    description: 'Family health: members, medicines and doses, vitals, appointments and emergency cards. Data stays on the owner\'s computer.',
    auth: { type: 'bearer', obtain: 'Swasthya → Settings → Connect to Larp' },
    endpoints: [
      { method: 'GET', path: '/api/summary', scope: 'health.summary', shares: 'Today\'s doses, upcoming appointments and flags for the whole family' },
      { method: 'GET', path: '/api/doses', scope: 'health.doses', shares: 'Scheduled doses for a day, with status' },
      { method: 'POST', path: '/api/doses', scope: 'health.doses.write', shares: 'Marks a dose taken or skipped' },
      { method: 'GET', path: '/api/busy', scope: 'calendar.busy', shares: 'Appointment time windows for a day, without details' },
      { method: 'GET', path: '/api/appointments', scope: 'health.appointments', shares: 'Appointments with doctor and place' },
      { method: 'GET', path: '/api/members/{id}/emergency', scope: 'health.emergency', shares: 'Blood group, allergies, conditions, medicines, emergency contact' },
      { method: 'GET', path: '/api/family', scope: 'health.family', shares: 'Family members and their health profile' },
    ],
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
  return true;
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) fail(413, 'Too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid JSON'); }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// The apps that live inside a Larp home: full apps with their own server and Larp endpoints,
// and the tools built into Larp itself.
export type App = {
  id: string; name: string; script?: string; kind: string; tagline: string; description: string;
  url: string; run: string; shot: string; inside: string; accent: string; features: string[];
  endpoints: number; source?: string;
};

export const APPS: App[] = [
  {
    id: 'swasthya', name: 'Swasthya', script: 'स्वास्थ्य', kind: 'Family health',
    tagline: 'Every heartbeat in your home, looked after.',
    description: 'Medicines and doses, vitals with trends, appointments and an emergency card for each person. Budh, a wellness guide, answers everyday questions and knows when to say "see a doctor".',
    url: 'http://localhost:5190', run: 'npm --prefix Swasthya run dev', shot: './apps/swasthya.jpg', inside: './apps/swasthya-app.jpg', accent: '#f2a65a',
    features: ['Doses', 'Vitals', 'Appointments', 'Emergency cards', 'Budh'], endpoints: 7, source: 'https://github.com/diiviikk5/Swasthya',
  },
  {
    id: 'kosh', name: 'Kosh', script: 'कोष', kind: 'Family finance',
    tagline: 'Every rupee, every person, one calm place.',
    description: 'Budgets, bills, savings goals and pocket money. Children ask for money and a parent approves; bills get claimed and paid; everyone chips in to goals, and a family feed shows who did what.',
    url: 'http://localhost:5200', run: 'npm --prefix Kosh run dev', shot: './apps/kosh.jpg', inside: './apps/kosh-app.jpg', accent: '#7a3cff',
    features: ['Money requests', 'Bills', 'Goals', 'Budgets', 'Family feed'], endpoints: 7,
  },
];

export const BUILT_IN = [
  { id: 'plans', name: 'Plans', kind: 'Home', text: 'Ask everyone\'s agents "free Saturday?" Each answers from its owner\'s calendar, sharing only free time.' },
  { id: 'money', name: 'Money', kind: 'Home', text: 'Shared expenses for a trip or a flat, with who-owes-whom settle-up. Larp never moves money.' },
  { id: 'care', name: 'Care', kind: 'Home', text: 'Checklists for looking after someone: who drives to the clinic, who picks up the medicine.' },
  { id: 'memory', name: 'Memory', kind: 'Agents', text: 'What each agent learns persists across days in Meko, and lessons a person approves become the space\'s knowledge.' },
];

// How skills are grouped on the page, and how each fits into Larp.
import raw from './skills.json';

export type Skill = {
  slug: string; repo: string; url: string; name: string; title: string; description: string;
  installs: number | null; install: string;
  n: number; craft: Craft; fit: string; pick: boolean;
};
export type Craft = 'Design' | 'Motion & video' | 'Memory' | 'Agents & planning' | 'Browser & testing' | 'Engineering' | 'Security' | 'Research & science' | 'Generative media';

const CRAFT: Record<string, Craft> = {
'vercel-react-native-skills':'Engineering','vercel-react-view-transitions':'Motion & video','writing-guidelines':'Design','vercel-optimize':'Engineering','brand-guidelines':'Design','internal-comms':'Agents & planning','theme-factory':'Design','web-artifacts-builder':'Design','skill-creator':'Agents & planning','executing-plans':'Agents & planning','receiving-code-review':'Engineering','finishing-a-development-branch':'Engineering','writing-skills':'Agents & planning','hf-cli':'Engineering','huggingface-papers':'Research & science','huggingface-community-evals':'Research & science','trl-training':'Research & science','seeker-domains':'Engineering','seeker-genesis-token':'Engineering',
'office-hours':'Agents & planning','plan-ceo-review':'Agents & planning','plan-eng-review':'Agents & planning','plan-design-review':'Design','design-consultation':'Design','design-review':'Design','qa':'Browser & testing','qa-only':'Browser & testing','cso':'Security','benchmark':'Browser & testing','devex-review':'Browser & testing','context-save':'Memory','context-restore':'Memory','autoplan':'Agents & planning','algorithmic-art':'Generative media','canvas-design':'Design','brainstorming':'Agents & planning','writing-plans':'Agents & planning','huggingface-datasets':'Research & science','huggingface-local-models':'Research & science','huggingface-llm-trainer':'Research & science',
  'frontend-design': 'Design', 'ui-ux-pro-max': 'Design', impeccable: 'Design', 'web-design-guidelines': 'Design', 'design-mobile-apps': 'Design',
  'design-taste-frontend': 'Design', 'image-to-ui': 'Design', shadcn: 'Design', 'emil-design-eng': 'Design', 'apple-design': 'Design',
  'stitch::code-to-design': 'Design', antislop: 'Design', anatomy: 'Design', 'visual-explainer': 'Design',
  animate: 'Motion & video', 'review-animations': 'Motion & video', 'remotion-best-practices': 'Motion & video', 'remotion-render': 'Motion & video', 'gsap-scrolltrigger': 'Motion & video', 'video-edit': 'Motion & video',
  'memory-management': 'Memory', 'unified-memory': 'Memory', 'continuous-learning-v2': 'Memory', 'agent-memory': 'Memory', 'agentmemory-persistent-memory': 'Memory',
  'memory-kit': 'Memory', 'shared-memory': 'Memory', 'obsidian-second-brain': 'Memory', 'caveman-compress': 'Memory',
  'planning-with-files': 'Agents & planning', 'self-improving-agent': 'Agents & planning', 'find-skills': 'Agents & planning', wayfinder: 'Agents & planning', 'chief-of-staff': 'Agents & planning',
  'claude-handoff': 'Agents & planning', 'subagent-driven-development': 'Agents & planning', 'dispatching-parallel-agents': 'Agents & planning', 'grill-me': 'Agents & planning',
  'agent-browser': 'Browser & testing', 'playwright-cli': 'Browser & testing', 'webapp-testing': 'Browser & testing', 'browser-to-api': 'Browser & testing', tdd: 'Browser & testing',
  'code-review': 'Engineering', 'codebase-design': 'Engineering', 'improve-codebase-architecture': 'Engineering', 'domain-modeling': 'Engineering', 'supabase-postgres-best-practices': 'Engineering',
  'vercel-react-best-practices': 'Engineering', 'vercel-composition-patterns': 'Engineering', 'systematic-debugging': 'Engineering', 'reverse-engineering': 'Engineering', graphify: 'Engineering', 'optimize-for-gpu': 'Engineering',
  'security-audit': 'Security', 'agent-security-audit': 'Security', 'solana-vulnerability-scanner': 'Security',
  research: 'Research & science', 'grill-with-docs': 'Research & science', 'what-if-oracle': 'Research & science', 'timesfm-forecasting': 'Research & science', geomaster: 'Research & science',
  'scientific-schematics': 'Research & science', 'competitor-teardown': 'Research & science',
  'ai-image-generation': 'Generative media', 'ai-video-generation': 'Generative media', 'image-to-video': 'Generative media', 'higgsfield-product-photoshoot': 'Generative media',
  'ai-podcast-creation': 'Generative media', 'ai-voice-cloning': 'Generative media',
};

// What the craft means inside Larp, shown on each card.
const FIT: Record<Craft, string> = {
  Design: 'Any Larp agent building UI can load it',
  'Motion & video': 'Runs on a Larp agent in its own worktree',
  Memory: 'Pairs with Larp\'s Meko memory across days',
  'Agents & planning': 'Fits Larp delegation and hand-offs',
  'Browser & testing': 'Gives a Larp task a real check to pass',
  Engineering: 'Raises the bar on delegated code',
  Security: 'Review before you accept a result',
  'Research & science': 'For agents that investigate, not just build',
  'Generative media': 'Needs that provider\'s own key on your machine',
};

// The ones we'd install first in a new Larp space.
const PICKS = new Set(['frontend-design', 'impeccable', 'emil-design-eng', 'shared-memory', 'planning-with-files', 'subagent-driven-development', 'webapp-testing', 'tdd', 'systematic-debugging', 'agent-security-audit', 'claude-handoff', 'continuous-learning-v2']);

export const CRAFTS: Craft[] = ['Design', 'Motion & video', 'Memory', 'Agents & planning', 'Browser & testing', 'Engineering', 'Security', 'Research & science', 'Generative media'];

export const SKILLS: Skill[] = (raw as Omit<Skill, 'n' | 'craft' | 'fit' | 'pick'>[]).map((s, i) => {
  const craft = CRAFT[s.slug] || 'Engineering';
  return { ...s, n: i + 1, craft, fit: FIT[craft], pick: PICKS.has(s.slug) };
});

export const fmtInstalls = (n: number | null) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));

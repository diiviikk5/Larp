export type Person = { id: string; name: string; color: string };
export type Space = { id: string; name: string; kind: 'build' | 'home'; memberIds: string[] };
export type Host = { id: string; name: string; ownerId: string; online: boolean; lastSeen: string | null };

export type Agent = {
  id: string; name: string; ownerId: string; hostId: string; runtime: string; model: string | null;
  spaceIds: string[]; repo: string | null; pal: string; online: boolean; busy: boolean;
  repoId?: string | null; usesApps?: boolean; skills?: string[];
};

export type LogLine = { at: string; kind: string; text: string };

export type TaskStatus =
  | 'awaiting_approval' | 'queued' | 'running' | 'waiting' | 'needs_review' | 'revision_requested' | 'accepted'
  | 'applying' | 'applied' | 'apply_failed' | 'denied' | 'cancelled' | 'failed' | 'interrupted';

export type Task = {
  id: string; spaceId: string; agentId: string; ownerId: string; createdBy: string; kind: string;
  title: string; instructions: string; check: string | null; repo: string | null; status: TaskStatus;
  attempts: { startedAt: string; finishedAt?: string; passed?: boolean | null; error?: string | null }[];
  feedback: { by: string; text: string; at: string }[];
  files: string[]; conflicts: { taskId: string; files: string[] }[]; log: LogLine[];
  result: null | {
    summary: string; diff: string; files: string[]; stat: string; branch: string | null; error: string | null;
    check: null | { command: string; passed: boolean; exitCode: number | null; output: string };
  };
  applied?: { ok: boolean; branch: string | null; message: string };
  applyHostId?: string; createdAt: string; updatedAt: string;
  /** Requests this task's agent sent to other agents, and their answers. */
  asks?: AgentAsk[];
  /** Set when this task is another agent's request: the asking task, and the agent that asked. */
  parentId?: string; askedBy?: string; repoId?: string | null;
  context?: { status: 'pending' | 'ready' | 'off' | 'unavailable'; at: string; items: Recalled[]; saved?: number; quality?: string | null };
  /** The result's diff, kept as a Meko artifact; duplicateOf names an earlier task with the identical result. */
  proof?: { artifactId: string | null; hash: string | null; size: number | null; duplicateOf: string | null; at: string; check: boolean | null };
};

/** One agent asking another for help while working; the answer resumes the asking task. */
export type AgentAsk = {
  id: string; to: string; toId: string; text: string; childId: string; at: string; answered: boolean;
  answer?: { ok: boolean; text: string; diff: string; files: string[]; at: string };
};

/** Something an agent recalled from Meko before working, and where it came from. */
export type Recalled = { id: string | null; text: string; score: number | null; source: 'memory' | 'handoff' | 'space' | 'skill' | 'app'; from: string; datapack: string };

/** One logged call to Meko. The memory view is drawn only from these. */
export type MekoCall = {
  id: string; at: string; tool: string; kind: 'write' | 'recall' | 'promote' | 'correct' | 'forget' | 'setup' | 'other';
  agent: string | null; agentId: string | null; to: string | null; toId: string | null; datapack: string | null;
  spaceId: string | null; taskId: string | null; summary: string; ok: boolean; skipped: boolean; ms: number; error: string | null; resultCount: number | null;
  /** The call was about the space's shared knowledge (lessons). */
  space?: boolean;
};

export type Lesson = { id: string; spaceId: string; taskId: string | null; text: string; proposedBy: string; approvedBy?: string; status: 'pending' | 'approved' | 'promoted' | 'declined'; memoryId?: string; createdAt: string };

export type Royalty = { saved: number; reuses: number; beneficiaries: Record<string, number>; items: Record<string, { text: string; reuses: number; saved: number; lastAt?: string; lastTask?: string | null }> };
export type SleepDigest = { at: string; reviewed: number; merged: { kept: string; removed: string[]; text: string }[]; forgot: { id: string; text: string; reason: string }[]; suggest: { memoryId: string; text: string; uses: number }[] };
export type ProofEntry = { taskId: string; title: string; agentId: string; artifactId: string | null; hash: string | null; size: number | null; duplicateOf: string | null; at: string; check: boolean | null };

export type MemoryView = {
  configured: boolean; on: boolean; team: string | null; store: 'yugabyte' | 'local'; via?: 'meko' | 'cloud' | null;
  packs: { agents: Record<string, string | null>; spaces: Record<string, string | null>; proofs?: string | null };
  calls: MekoCall[]; lessons: Lesson[];
  totals: { saved: number; recalls: number };
  royalties: Record<string, Royalty>;
  sleep: Record<string, SleepDigest>;
  proofs: ProofEntry[];
};

export type Approval = {
  id: string; spaceId: string; ownerId: string; kind: 'run_task' | 'tool' | 'share' | 'lesson';
  taskId: string | null; planId?: string | null; title: string; detail: string; status: string; createdAt: string;
};

export type Answer = Record<string, unknown>;
export type Plan = {
  id: string; spaceId: string; createdBy: string; title: string; day: string; fields: string[]; createdAt: string;
  queries: { id: string; personId: string; agentId: string | null; fields: string[]; status: string; answer: Answer | null }[];
  result: { pending: number; complete: boolean; windows: { from: string; to: string }[]; budgetPerPerson: number | null; missing: string[] };
};

export type Expense = { id: string; spaceId: string; description: string; amount: number; paidBy: string; splitAmong: string[]; createdAt: string };
export type Checklist = { id: string; spaceId: string; title: string; items: { id: string; text: string; ownerId: string | null; done: boolean }[] };
export type LarpEvent = { id: string; at: string; type: string; spaceId: string; actor?: string | null; taskId?: string; text: string };

export type State = {
  version: number; me: Person; phones: number; spaces: Space[]; people: Person[]; hosts: Host[]; agents: Agent[];
  tasks: Task[]; approvals: Approval[]; waitingOn: { id: string; spaceId: string; ownerId: string; taskId: string | null; title: string }[];
  plans: Plan[]; expenses: Expense[]; checklists: Checklist[]; events: LarpEvent[]; memory: MemoryView;
  telegram?: { connected: boolean; botName: string | null; linked: boolean; linkedIds: string[]; keeper: boolean };
  settlements: Record<string, { balance: Record<string, number>; transfers: { from: string; to: string; amount: number }[] }>;
};

export type LocalAgent = {
  skills?: string[]; runtime: string; model: string | null; repoPath: string | null; baseUrl: string | null; apiKeyEnv: string | null; codexHome?: string | null; useApps?: boolean;
  private: { calendar: { day: string; title: string; from: string; to: string }[]; availability: Record<string, { from: string; to: string }[]>; budget: number | null };
  sharing: Record<string, 'auto' | 'ask' | 'never'>;
};

export type DeviceConfig = {
  mode: 'host' | 'join' | null; url: string | null; lan: boolean; splash?: boolean; urls: string[];
  people: { id: string; name: string; token: string }[]; activePersonId: string | null;
  host: null | { online: boolean; hostId: string; running: string[]; agents: Record<string, LocalAgent>; name: string };
  others?: { label: string; mode: 'host' | 'join'; url: string | null }[];
};

/** An app connected to this desktop (Swasthya, Kosh); its token stays in the main process. */
export type ConnectedApp = { id: 'swasthya' | 'kosh'; name: string; kind: string; url: string | null; running: boolean; connected: boolean; connectedAt: string | null };

export type RuntimeStatus = { installed: boolean; detail: string; note?: string | null; endpoint?: string | null; models?: string[]; modelNotes?: Record<string, string> };

declare global {
  interface Window {
    larp?: {
      workspace(args: Record<string, unknown>): Promise<any>;
      appSnapshot(args: Record<string, unknown>): Promise<any>;
      config(): Promise<DeviceConfig>;
      createSpace(args: { spaceName: string; kind: string; name: string; lan: boolean }): Promise<DeviceConfig>;
      joinSpace(args: { url: string; code: string; name: string }): Promise<DeviceConfig>;
      joinAnother(args: { url: string; code: string; name: string; label: string }): Promise<DeviceConfig>;
      switchDevice(args: { index: number; label: string }): Promise<DeviceConfig>;
      retry(): Promise<DeviceConfig>;
      leaveSpace(args: { label?: string }): Promise<DeviceConfig>;
      addPerson(args: { code: string; name: string }): Promise<DeviceConfig>;
      switchPerson(args: { id: string }): Promise<DeviceConfig>;
      addAgent(args: Record<string, unknown>): Promise<Agent>;
      updateAgent(args: { agentId: string; patch: Record<string, unknown> }): Promise<LocalAgent>;
      removeAgent(args: { agentId: string }): Promise<unknown>;
      chooseFolder(): Promise<string | null>;
      createDemoProject?(): Promise<string>;
      updateStatus?(): Promise<{ version: string; ready: string | null }>;
      installUpdate?(): Promise<unknown>;
      onUpdate?(fn: (info: { version: string }) => void): () => void;
      setLan(args: { lan: boolean }): Promise<DeviceConfig>;
      setSplash(args: { enabled: boolean }): Promise<DeviceConfig>;
      setTitleBar?(args: { color: string; symbol: string }): Promise<unknown>;
      detectRuntimes?(): Promise<Record<string, RuntimeStatus>>;
      codexProfile?(args: { action: 'status' | 'login' | 'open' | 'cancel'; own?: boolean }): Promise<{ dir: string | null; command: string; installed: boolean; signedIn: boolean; pending?: boolean; url?: string | null; detail: string }>;
      openExternal(args: { url: string }): Promise<unknown>;
      appsList?(): Promise<ConnectedApp[]>;
      appsConnect?(args: { id: string; url?: string }): Promise<ConnectedApp[]>;
      appsDisconnect?(args: { id: string }): Promise<ConnectedApp[]>;
      appsCall?<T = any>(args: { id: string; method?: string; path: string; body?: unknown }): Promise<T>;
      onChange(fn: () => void): () => void;
    };
  }
}

import type { Larp } from './api';
import type { DeviceConfig, Space, State } from './types';

export type Route =
  | { page: 'overview' }
  | { page: 'workspace' }
  | { page: 'skills' }
  | { page: 'tasks'; filter?: TaskFilter }
  | { page: 'task'; id: string; tab?: 'conversation' | 'changes' | 'check' }
  | { page: 'agents' }
  | { page: 'agent'; id: string }
  | { page: 'agent-new' }
  | { page: 'people' }
  | { page: 'activity' }
  | { page: 'memory' }
  | { page: 'apps' }
  | { page: 'app'; id: 'swasthya' | 'kosh' | 'citylines' | 'eduspace' | 'studio'; tab?: 'overview' | 'full' }
  | { page: 'settings'; tab?: SettingsTab }
  | { page: 'plans'; id?: string }
  | { page: 'money' }
  | { page: 'care'; id?: string };

export type TaskFilter = 'all' | 'mine' | 'active' | 'review' | 'done';
export type SettingsTab = 'device' | 'network' | 'phones' | 'telegram' | 'appearance' | 'about';

/** Everything a page needs: data, the current space, this device, and navigation. */
export type Ctx = {
  larp: Larp;
  state: State;
  space: Space;
  device: DeviceConfig | null;
  phone: boolean;
  go: (route: Route) => void;
  newTask: (options?: { agentId?: string }) => void;
  reloadDevice: () => void;
  setDevice: (d: DeviceConfig) => void;
};

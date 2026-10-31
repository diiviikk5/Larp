// Invite links: one string that carries a space's address and a one-time code, so joining is a single
// paste. Format: larp://join?at=<address>&code=<code>. The Join form also accepts the bare parts.

export const DOWNLOAD_PAGE = 'https://larp-seven.vercel.app';

export function inviteLink(address: string, code: string) {
  return `larp://join?at=${encodeURIComponent(address)}&code=${encodeURIComponent(code)}`;
}

/** The address and code inside an invite link (or a message containing one), or null if there is none. */
export function parseInvite(text: string): { url: string; code: string } | null {
  const match = text.match(/larp:\/\/join\?\S+/);
  if (!match) return null;
  const params = new URLSearchParams(match[0].slice(match[0].indexOf('?') + 1));
  const url = params.get('at')?.trim();
  const code = params.get('code')?.trim().toUpperCase();
  return url && code && /^https?:\/\//.test(url) ? { url, code } : null;
}

/** Tailscale gives every device an address in 100.64.0.0/10; anything else is the local network. */
export function isTailscale(address: string) {
  const m = address.match(/^https?:\/\/100\.(\d+)\./);
  return Boolean(m && Number(m[1]) >= 64 && Number(m[1]) <= 127);
}

/** The message a host sends a friend: where to get Larp, how to reach the space, and the invite. */
export function inviteMessage({ spaceName, address, code, expiresAt }: { spaceName: string; address: string; code: string; expiresAt: number }) {
  const until = new Date(expiresAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const steps = [
    `Join my Larp space "${spaceName}":`,
    '',
    `1. Install Larp: ${DOWNLOAD_PAGE} (if Windows warns, choose More info, then Run anyway).`,
    ...(isTailscale(address) ? ['2. Install Tailscale (tailscale.com) and accept my invite to my Tailscale network.'] : ['2. Be on the same Wi-Fi as me.']),
    '3. Open Larp, choose "Join a space", and paste this invite:',
    '',
    inviteLink(address, code),
    '',
    `The invite works once, until ${until}. For your agent, pick Codex and sign in with your own ChatGPT account.`,
  ];
  return steps.join('\n');
}

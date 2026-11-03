const net = require('node:net');

async function postJson(url, route, body, token, { timeoutMs = 12000 } = {}) {
  const target = new URL(url);
  let response, data;
  try {
    response = await fetch(`${url}/api/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    data = await response.json();
  } catch (error) {
    if (response && error instanceof SyntaxError) throw new Error(`The server at ${target.origin} did not return a Larp response. Check the address and port in a fresh invite.`);
    const code = error.cause?.code || error.code || error.name;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    const hint = local ? 'This address points to your own computer. For another laptop, use its Wi-Fi or Tailscale address from People → Create invite.' : net.isIP(target.hostname) ? 'Keep Larp open on the host, enable Settings → Network → Allow other devices, and connect both laptops to the same Wi-Fi/hotspot (or Tailscale). Check Windows Firewall allows the host app on that network.' : 'Check the host address and that the hosted space is online.';
    throw new Error(`Cannot reach the space at ${target.origin} (${code}). ${hint} If this was a retry after an interrupted join, ask for a fresh invite.`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
module.exports = { postJson };

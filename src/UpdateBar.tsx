import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

/** When a newer Larp has been downloaded in the background, offer to restart into it. */
export function UpdateBar() {
  const [ready, setReady] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!window.larp?.updateStatus) return;
    window.larp.updateStatus().then((s) => setReady(s.ready)).catch(() => {});
    return window.larp.onUpdate?.((info) => setReady(info.version));
  }, []);
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <Download size={15} />
      <span className="grow">Larp {ready} is ready. Your spaces and agents carry over.</span>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setBusy(true); window.larp!.installUpdate!().catch(() => setBusy(false)); }}>Restart to update</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setReady(null)}>Later</button>
    </div>
  );
}

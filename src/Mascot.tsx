// Larp, the mascot: a small monochrome tile with a screen face and an L-shaped antenna
// that echoes the logo. Its pose always reflects real state, never decoration alone.
export type Pose = 'idle' | 'working' | 'happy' | 'alert' | 'sleeping';

export function Mascot({ pose = 'idle', size = 64, title }: { pose?: Pose; size?: number; title?: string }) {
  const label = title || { idle: 'Larp is idle', working: 'Larp is working', happy: 'Larp is happy: all done', alert: 'Larp needs your attention', sleeping: 'Larp is asleep: no agents online' }[pose];
  return (
    <svg className={`mascot pose-${pose}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label}>
      <ellipse className="m-shadow" cx="32" cy="60" rx="17" ry="2.5" />
      <g className="m-body-group">
        {/* antenna: an L, like the logo */}
        <path className="m-antenna" d="M30 17V8h8" />
        <rect className="m-tip" x="36.5" y="5.5" width="5" height="5" rx="1.2" />
        <rect className="m-body" x="12" y="16" width="40" height="38" rx="11" />
        <rect className="m-face" x="18" y="23" width="28" height="20" rx="6.5" />
        {pose === 'happy' ? (
          <g className="m-eyes">
            <path className="m-arc" d="M23.5 35c1.5-3 4.5-3 6 0" />
            <path className="m-arc" d="M34.5 35c1.5-3 4.5-3 6 0" />
          </g>
        ) : pose === 'sleeping' ? (
          <g className="m-eyes">
            <path className="m-arc" d="M24 33.5h5" />
            <path className="m-arc" d="M35 33.5h5" />
          </g>
        ) : (
          <g className="m-eyes">
            <rect className="m-eye" x="25" y={pose === 'alert' ? 27.5 : 29} width="4.5" height={pose === 'alert' ? 9 : 8} rx="2.25" />
            <rect className="m-eye" x="34.5" y={pose === 'alert' ? 27.5 : 29} width="4.5" height={pose === 'alert' ? 9 : 8} rx="2.25" />
          </g>
        )}
        <rect className="m-foot" x="19" y="53" width="9" height="5" rx="2" />
        <rect className="m-foot" x="36" y="53" width="9" height="5" rx="2" />
      </g>
      {pose === 'sleeping' && <text className="m-z" x="47" y="14">z</text>}
      {pose === 'alert' && <rect className="m-ping" x="46" y="12" width="6" height="6" rx="3" />}
      {pose === 'working' && (
        <g className="m-dots">
          <circle cx="54" cy="24" r="1.6" /><circle cx="58" cy="24" r="1.6" /><circle cx="62" cy="24" r="1.6" />
        </g>
      )}
    </svg>
  );
}

/** Decide the mascot's mood from the space's real state. */
export function moodOf(o: { waiting: number; running: number; agentsOnline: number; agents: number; done: number }): Pose {
  if (o.waiting > 0) return 'alert';
  if (o.running > 0) return 'working';
  if (o.agents > 0 && o.agentsOnline === 0) return 'sleeping';
  if (o.done > 0) return 'happy';
  return 'idle';
}

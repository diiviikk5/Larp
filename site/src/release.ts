// The current desktop release. Set VITE_DOWNLOAD_BASE when building the site to point at where the
// installers are hosted (for example a GitHub Releases "latest/download" URL); by default the site
// serves them itself from /downloads.
const base = (import.meta.env.VITE_DOWNLOAD_BASE as string | undefined)?.replace(/\/$/, '') || '/downloads';
const version = '0.6.1';

export const RELEASE = {
  version,
  windows: `${base}/Larp-Setup-${version}.exe`,
  windowsSize: '99 MB',
};

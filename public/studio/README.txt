Studio — a Larp creative review mini app

Open index.html or serve the directory with any static server. All assets are
bundled locally; no package install or API key is required.

Routes: overview, projects, project brief and concepts, concept review, side-by-side
comparison, decision history and activity. URL fragments support deep links,
browser Back/Forward and Larp's embedded file view.

The demo includes three fictional creative projects, six concepts, feedback and
one sample approval. Add projects and concepts, upload a PNG/JPEG/WebP under 2 MB,
leave categorized feedback, resolve notes and record approvals or change requests
with a reason. The workspace button changes your reviewer name or resets the demo.

All records persist locally under larp.studio.v1 in browser localStorage. The
standalone browser preview and Electron file view have separate storage. Nothing
is shared with other people, agents or external services. Approval only records a
local decision; it does not publish work, merge code or run an agent. Team sync,
asset version uploads, image annotations and automatic agent summaries are not
connected.

Larp integration is included in the host repo: Apps tile, route, breadcrumb and
iframe at ./studio/index.html. Run npm run build and reopen Apps > Studio.

Visual direction is adapted from the supplied Hearthstone template: ivory,
charcoal, sage, brass accents and condensed editorial typography. The coffee
artwork is used within a fictional example campaign, not as Studio branding.
Generated sample artwork has illustrative labels; it is not verified commercial
brand artwork. Supplied font and GSAP license notices are retained.

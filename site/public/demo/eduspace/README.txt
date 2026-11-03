EduSpace — Larp learning mini app

Open index.html in a modern browser, or serve this directory from a static server.
No install, account, API key or external font service is required.

Views: overview, course discovery, enrolled courses, course and chapter details,
assignments and assignment details, schedule, notes and note details, resources,
focus timer, sample study circle, notifications and settings.
Navigation uses URL fragments so browser Back/Forward and deep links work in
Larp's embedded file-based view as well as when served locally.

The initial workspace includes fictional demo data. Edits persist under
larp.eduspace.workspace.v1 in localStorage, separately from Citylines data.
Settings > Reset demo records restores the sample workspace.

Learning content consists of short sample prompts, not accredited courses or
video lessons. Community profiles are fictional; messaging and cross-device sync
are not connected. The focus timer records elapsed whole minutes when finished.

Larp integration: the host repository includes an EduSpace tile, route, breadcrumb
and local iframe at ./eduspace/index.html. Rebuild Larp with npm run build and
reopen Apps > EduSpace. Keep every asset in this directory together.

Original template assets and license notices are retained: Outfit font and OFL,
GSAP and its supplied notice, and the supplied portrait sheet.

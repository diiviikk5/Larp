# Education dashboard reference — design and expansion notes

## Reference and scope
A single, desktop-first online education dashboard recreated from the supplied screenshot. The original reference used a rounded browser window floating on mint; the current revision fills the viewport. The screenshot's visible names, course titles, category chips, friendly pastel cards and yearly activity arrangement are retained as demo data. Profile photographs are newly generated composite avatars, not the original people. Activity derives from completed demo milestones stored locally. Course enrollment and progress persist in this browser; no account or real course content is supplied.

## Composition
At desktop size the full-screen shell has three columns: a narrow pale-blush icon rail; a roomy central course discovery area; and a softly tinted profile/activity panel. The left title is a two-line, regular-weight black sans serif with ample whitespace. The first row of category chips sits immediately below it, followed by two columns of rounded course cards. The right panel starts with sparse utility icons, centered portrait and name, friends pill, activity card, then enrolled-course cards.

## Visual vocabulary
Mint outer ground #bcebd8; warm near-white shell #fcf9f7; blush rail #f2ebe6; dark ink #111016. Course categories use dusty rose #f2c1c5, apricot #fbe0c0, lavender #d8d2f8 and mint #bdebd6; these colors identify card families rather than success or risk. White circular icon badges, minimal black outlined icons, generous 20–27px component radii, soft surfaces and very limited shadows. Outfit is bundled under its existing SIL OFL notice. Generated profile sheet uses a 2×2 sprite so each person has a stable appearance.

## Interaction and state
Category chips filter the discovery cards and expose their selected state. Course cards open a native dialog; enrollment and demo lesson milestones are saved locally. The Year/Week selector groups recorded demo activity. Notifications, friends and settings use local demo data. Keyboard focus must remain visible; native dialogs allow Escape. Use transforms for hover and respect reduced motion.

## Expansion plan
Keep the shell and reference styling; extend the existing semantic data model before building additional views. Expand the existing local search and course details into dedicated routes, add real syllabus and instructors, then actual sign-in and cross-device persistence when requested. A future schedule should connect to real dates, and activity charts should derive from recorded learning sessions rather than illustrative values. The original decorative browser bar is hidden in the full-screen version. Avoid adding a separate marketing hero above the dashboard. Maintain category color mappings and shared card, chip, badge, avatar and panel styles across future screens. Add responsive behavior and content reflow in a dedicated later pass, since the current task prioritizes matching the desktop reference.

## Files
eduspace.html contains markup, styles, sample data and interactions. eduspace-people.png is the generated avatar sheet. Outfit.ttf and its license are included in the downloadable template. No network, external API or build step is needed after extraction.


## Full-screen revision
The browser frame and mint outer margins were removed in response to the full-screen request. The rail, main canvas and profile panel fill the viewport. A compact GSAP-animated welcome panel introduces the workspace while retaining the pastel course grid. Explore, My courses, Schedule, Settings, Notifications and the sample community now have dedicated local views. Course enrollment, lesson milestones, plans and display name persist in localStorage under a namespaced key. The Year/Week graph totals the 15-minute demo lesson milestones completed on this device. Course names and lesson text are samples; lessons are milestone interactions, not actual classes or videos. No account or cross-device sync is implied. The downloadable site includes local GSAP and its notice.

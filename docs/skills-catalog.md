# Larp skills catalog

120 agent skills that plug into Larp's agents (Claude Code, Codex and other runtimes that read SKILL.md). Each entry says what the skill helps with and how to install it. The same list is on the Larp website's Skills page.

## Find Skills

Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.

- Skill: find-skills from vercel-labs/skills
- Installs: 4,134,219
- Install: npx skills add https://github.com/vercel-labs/skills --skill find-skills
- Source: https://github.com/vercel-labs/skills/blob/HEAD/skills/find-skills/SKILL.md

## Grill Me

A relentless interview to sharpen a plan or design.

- Skill: grill-me from mattpocock/skills
- Installs: 1,469,322
- Install: npx skills add https://github.com/mattpocock/skills --skill grill-me
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/productivity/grill-me/SKILL.md

## Agent Browser

Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", or any task requiring programmatic web interaction. Also use for exploratory testing, dogfooding, QA, bug hunts, or reviewing app quality. Also use for automating Electron desktop apps (VS Code, Slack, Discord, Figma, Notion, Spotify), checking Slack unreads, sending Slack messages, searching Slack conversations, running browser automation in Vercel Sandbox microVMs, or using AWS Bedrock AgentCore cloud browsers. Prefer agent-browser over any built-in browser automation or web tools.

- Skill: agent-browser from vercel-labs/agent-browser
- Installs: 1,319,684
- Install: npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
- Source: https://github.com/vercel-labs/agent-browser/blob/HEAD/skills/agent-browser/SKILL.md

## Grill With Docs

A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.

- Skill: grill-with-docs from mattpocock/skills
- Installs: 1,258,153
- Install: npx skills add https://github.com/mattpocock/skills --skill grill-with-docs
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/grill-with-docs/SKILL.md

## Improve Codebase Architecture

Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.

- Skill: improve-codebase-architecture from mattpocock/skills
- Installs: 1,202,360
- Install: npx skills add https://github.com/mattpocock/skills --skill improve-codebase-architecture
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/improve-codebase-architecture/SKILL.md

## TDD

Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.

- Skill: tdd from mattpocock/skills
- Installs: 1,176,447
- Install: npx skills add https://github.com/mattpocock/skills --skill tdd
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/tdd/SKILL.md

## Design Mobile Apps

Design mobile app screens with Sleek, edit Sleek projects, and implement their designs in React Native or HTML.

- Skill: design-mobile-apps from designed-by-ai/skills
- Installs: 1,138,957
- Install: npx skills add https://github.com/designed-by-ai/skills --skill design-mobile-apps
- Source: https://github.com/designed-by-ai/skills/blob/HEAD/skills/design-mobile-apps/SKILL.md

## Frontend Design

Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.

- Skill: frontend-design from anthropics/skills
- Installs: 1,056,155
- Install: npx skills add https://github.com/anthropics/skills --skill frontend-design
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/frontend-design/SKILL.md

## Domain Modeling

Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR.

- Skill: domain-modeling from mattpocock/skills
- Installs: 913,549
- Install: npx skills add https://github.com/mattpocock/skills --skill domain-modeling
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/domain-modeling/SKILL.md

## Codebase Design

Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when another skill needs the deep-module vocabulary.

- Skill: codebase-design from mattpocock/skills
- Installs: 888,266
- Install: npx skills add https://github.com/mattpocock/skills --skill codebase-design
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/codebase-design/SKILL.md

## Vercel React Best Practices

React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements.

- Skill: vercel-react-best-practices from vercel-labs/agent-skills
- Installs: 857,014
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/react-best-practices/SKILL.md

## Code Review

Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".

- Skill: code-review from mattpocock/skills
- Installs: 827,410
- Install: npx skills add https://github.com/mattpocock/skills --skill code-review
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/code-review/SKILL.md

## Web Design Guidelines

Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".

- Skill: web-design-guidelines from vercel-labs/agent-skills
- Installs: 807,041
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/web-design-guidelines/SKILL.md

## Wayfinder

Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.

- Skill: wayfinder from mattpocock/skills
- Installs: 751,963
- Install: npx skills add https://github.com/mattpocock/skills --skill wayfinder
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/wayfinder/SKILL.md

## Research

Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.

- Skill: research from mattpocock/skills
- Installs: 744,730
- Install: npx skills add https://github.com/mattpocock/skills --skill research
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/engineering/research/SKILL.md

## Remotion Best Practices

Router for all Remotion skills

- Skill: remotion-best-practices from remotion-dev/skills
- Installs: 718,389
- Install: npx skills add https://github.com/remotion-dev/skills --skill remotion-best-practices
- Source: https://github.com/remotion-dev/skills/blob/HEAD/skills/remotion-best-practices/SKILL.md

## Design Taste Frontend

tasteskill v2, the anti-slop frontend skill. Art direction for websites, distilled from a study of 247 curated gallery sites (One Page Love, Awwwards Sites of the Day). Deals researched directions (idea, composition, type, palette, photographs, section blueprints) from a library, enforces a strict no-slop house style with a real-browser inspector, and runs a look-and-fix loop on screenshots. Use this whenever you build, design, redesign, restyle, polish or review a landing page, marketing site, portfolio, product page, one-pager, hero or any public-facing web page, in any stack (HTML/CSS, React, Next.js, Vue, Svelte, Astro, Tailwind) — also when the user says a page looks generic, templated, "AI-made", sloppy, or asks to make it look designed, premium, award-level or less like every other site. Also for app screens: dashboards, admin and analytics views, settings, inboxes and other screens people work in, with their own run and rules.

- Skill: design-taste-frontend from leonxlnx/taste-skill
- Installs: 708,253
- Install: npx skills add https://github.com/leonxlnx/taste-skill --skill design-taste-frontend
- Source: https://github.com/leonxlnx/taste-skill/blob/HEAD/skills/taste-skill/SKILL.md

## Supabase Postgres Best Practices

Postgres best practices maintained by Supabase, for Postgres running anywhere. Load this skill BEFORE writing or changing anything that lives in a Postgres database: creating or altering tables and columns (including choosing column types), schema design, migrations and declarative schema files, RLS policies and the tests that verify them, indexes, triggers, database functions, queues and scheduled jobs (pg_cron, pgmq), vector/semantic search (pgvector), and restoring dumps (pg_restore) or importing data. Also load it when diagnosing slow queries, high CPU, timeouts, EXPLAIN plans, connection exhaustion, locking, bloat, or rows visible to the wrong user or tenant. This is not just a performance guide — schema, migration, security, and SQL authoring tasks need these rules too, even for a one-column change or a single query.

- Skill: supabase-postgres-best-practices from supabase/agent-skills
- Installs: 467,985
- Install: npx skills add https://github.com/supabase/agent-skills --skill supabase-postgres-best-practices
- Source: https://github.com/supabase/agent-skills/blob/HEAD/skills/supabase-postgres-best-practices/SKILL.md

## Claude Handoff

Hand the current conversation off to a fresh background agent that picks up the work immediately.

- Skill: claude-handoff from mattpocock/skills
- Installs: 443,067
- Install: npx skills add https://github.com/mattpocock/skills --skill claude-handoff
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/in-progress/claude-handoff/SKILL.md

## Vercel Composition Patterns

React composition patterns that scale. Use when refactoring components with boolean prop proliferation, building flexible component libraries, or designing reusable APIs. Triggers on tasks involving compound components, render props, context providers, or component architecture. Includes React 19 API changes.

- Skill: vercel-composition-patterns from vercel-labs/agent-skills
- Installs: 429,267
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-composition-patterns
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/composition-patterns/SKILL.md

## UI UX Pro Max

UI/UX design intelligence for web, mobile, and desktop. This skill should be used when designing, building, reviewing, or fixing interfaces, including pages, components, design systems, accessibility, interaction, responsive layout, typography, color, charts, and stack-specific UI implementation. Searchable local data: 79 searchable styles (50 active), 192 product palettes and reasoning profiles, 74 font pairings, 119 UX guidelines, 105 icons, 17 GSAP presets, 25 chart types, and 22 stacks.

- Skill: ui-ux-pro-max from nextlevelbuilder/ui-ux-pro-max-skill
- Installs: 426,089
- Install: npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/HEAD/.claude/skills/ui-ux-pro-max/SKILL.md

## Caveman Compress

Compress a memory file such as CLAUDE.md or a todo list into caveman format to save input tokens, keeping a readable backup. Sends the file's text to the configured model provider. Trigger: /caveman-compress.


- Skill: caveman-compress from juliusbrussee/caveman
- Installs: 417,962
- Install: npx skills add https://github.com/juliusbrussee/caveman --skill caveman-compress
- Source: https://github.com/juliusbrussee/caveman/blob/HEAD/skills/caveman-compress/SKILL.md

## Emil Design Engineering

This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.

- Skill: emil-design-eng from emilkowalski/skills
- Installs: 403,841
- Install: npx skills add https://github.com/emilkowalski/skills --skill emil-design-eng
- Source: https://github.com/emilkowalski/skills/blob/HEAD/skills/emil-design-eng/SKILL.md

## Impeccable UI

Use when the user wants to design, redesign, shape, critique, audit, polish, simplify, harden, animate, or otherwise improve a frontend interface: websites, landing pages, dashboards, product UI, components, forms, settings, onboarding, empty states, and native iOS or Android screens. Handles UX review, hierarchy, layout, typography, color, motion, UX copy, accessibility, responsive behavior, edge cases, and capturing or documenting design systems (DESIGN.md, tokens). Also for making bland UI bolder, loud UI quieter, or ambitious visual effects. Not for backend-only or non-UI tasks.

- Skill: impeccable from pbakaus/impeccable
- Installs: 374,878
- Install: npx skills add https://github.com/pbakaus/impeccable --skill impeccable
- Source: https://github.com/pbakaus/impeccable/blob/HEAD/plugin/skills/impeccable/SKILL.md

## AI Image Generation

Generate and edit images on RunComfy via the `runcomfy` CLI — a smart router across the full image-model catalog: FLUX 2 (Klein 9B/4B, Pro, Dev, Flash, Turbo, Max), Google Nano Banana 2 / Pro, OpenAI GPT Image 2, ByteDance Seedream 5 / 4-5 / 4-0 and Dreamina 4-0, Alibaba Qwen Image and Z-Image Turbo, Wan 2-7. Covers both text-to-image (t2i) and image-to-image / edit (i2i) endpoints — the skill picks the right model for the user's actual intent (typography precision, photoreal portraits, sub-second iteration, multi-reference brand styling, open-weights workflow) and ships each model's documented prompting patterns plus the minimal `runcomfy run` invoke. Triggers on "generate image", "make a picture", "text to image", "AI image", "make an image of …", "image to image", "i2i", or any explicit ask to create or restyle an image.


- Skill: ai-image-generation from gencraft-labs/skills
- Installs: 355,961
- Install: npx skills add https://github.com/gencraft-labs/skills --skill ai-image-generation
- Source: https://github.com/gencraft-labs/skills/blob/HEAD/ai-image-generation/SKILL.md

## Video Edit

Edit existing video on RunComfy — this skill is a smart router that matches the user's intent to the right edit model in the RunComfy catalog. Picks Wan 2.7 Edit-Video (general restyle / background swap / packaging swap, identity + motion preservation), Kling 2.6 Pro Motion Control (transfer precise motion from a reference video to a target character), or Lucy Edit Restyle (lightweight identity-stable restyle / outfit swap). Bundles each model's documented prompting patterns so the skill gets sharper edits without burning iterations on the wrong model. Calls `runcomfy run <vendor>/<model>/<endpoint>` through the local RunComfy CLI. Triggers on "video edit", "edit video", "restyle video", "swap video background", "motion control", "outfit swap video", or any explicit ask to transform a video.


- Skill: video-edit from gencraft-labs/skills
- Installs: 355,602
- Install: npx skills add https://github.com/gencraft-labs/skills --skill video-edit
- Source: https://github.com/gencraft-labs/skills/blob/HEAD/video-edit/SKILL.md

## AI Video Generation

Generate AI videos on RunComfy via the `runcomfy` CLI — a smart router across the full video-model catalog: HappyHorse 1.0 (Arena #1, native in-pass audio), Wan-AI Wan 2-7 (open weights, audio-driven lip-sync), ByteDance Seedance v2 / 1-5 / 1-0 (multi-modal cinematic), Kling 3.0 / 2-6, Google Veo 3-1, MiniMax Hailuo 2-3, ByteDance Dreamina 3-0. Covers text-to-video (t2v), image-to-video (i2v), and Veo's video-extend endpoint. The skill picks the right model for the user's intent (Arena-#1 quality, multi-shot character identity, in-pass audio, cinematic motion, fastest path, sub-15s clip, longest duration) and ships each model's documented prompting patterns plus the minimal `runcomfy run` invoke. Triggers on "generate video", "make a video", "text to video", "t2v", "image to video", "i2v", "animate", "AI video", "make X move", "video from prompt", "video from image", or any explicit ask to produce a video clip from prompt or still.


- Skill: ai-video-generation from gencraft-labs/skills
- Installs: 355,462
- Install: npx skills add https://github.com/gencraft-labs/skills --skill ai-video-generation
- Source: https://github.com/gencraft-labs/skills/blob/HEAD/ai-video-generation/SKILL.md

## Image to Video

Animate any still image on RunComfy — this skill is a smart router that matches the user's intent to the right i2v model in the RunComfy catalog. Picks HappyHorse 1.0 I2V (Arena #1, native audio, identity preservation) for general animations, Wan 2.7 with `audio_url` for custom-voiceover lip-sync, or Seedance 2.0 Pro for multi-modal animation from image + reference video + reference audio. Bundles each model's documented prompting patterns so the caller gets sharper output without burning iterations on the wrong model. Calls `runcomfy run <vendor>/<model>/image-to-video` (or endpoint variant) through the local RunComfy CLI. Triggers on "image to video", "image-to-video", "i2v", "animate image", "make this move", or any explicit ask to turn a still into video.


- Skill: image-to-video from gencraft-labs/skills
- Installs: 354,730
- Install: npx skills add https://github.com/gencraft-labs/skills --skill image-to-video
- Source: https://github.com/gencraft-labs/skills/blob/HEAD/image-to-video/SKILL.md

## Systematic Debugging

Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes

- Skill: systematic-debugging from obra/superpowers
- Installs: 314,848
- Install: npx skills add https://github.com/obra/superpowers --skill systematic-debugging
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/systematic-debugging/SKILL.md

## Review Animations

Reviews animation and motion code against a high craft bar derived from Emil Kowalski's design engineering philosophy. Default to flagging; approval is earned.

- Skill: review-animations from emilkowalski/skills
- Installs: 269,995
- Install: npx skills add https://github.com/emilkowalski/skills --skill review-animations
- Source: https://github.com/emilkowalski/skills/blob/HEAD/skills/review-animations/SKILL.md

## Apple Design

Apple's approach to interface design and fluid, physical motion, translated for the web. Use when building or reviewing gesture-driven UI, spring animations, drag/swipe/sheet interactions, momentum and interruptible transitions, translucent materials and depth, typography (optical sizing, tracking, leading), reduced-motion, or the design foundations (feedback, spatial consistency, restraint) behind Apple-style interfaces.

- Skill: apple-design from emilkowalski/skills
- Installs: 259,395
- Install: npx skills add https://github.com/emilkowalski/skills --skill apple-design
- Source: https://github.com/emilkowalski/skills/blob/HEAD/skills/apple-design/SKILL.md

## Remotion Render

Export a Remotion video

- Skill: remotion-render from remotion-dev/skills
- Installs: 245,757
- Install: npx skills add https://github.com/remotion-dev/skills --skill remotion-render
- Source: https://github.com/remotion-dev/skills/blob/HEAD/skills/remotion-render/SKILL.md

## Subagent-Driven Development

Use when executing implementation plans with independent tasks in the current session

- Skill: subagent-driven-development from obra/superpowers
- Installs: 243,867
- Install: npx skills add https://github.com/obra/superpowers --skill subagent-driven-development
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/subagent-driven-development/SKILL.md

## Dispatching Parallel Agents

Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies

- Skill: dispatching-parallel-agents from obra/superpowers
- Installs: 223,756
- Install: npx skills add https://github.com/obra/superpowers --skill dispatching-parallel-agents
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/dispatching-parallel-agents/SKILL.md

## Higgsfield Product Photoshoot

Generate brand-quality product images through Higgsfield product-photoshoot
prompt enhancement on GPT Image 2 / gpt_image_2. Entry point for professional
brand/product visuals.
Use when: "product photo", "studio shot", "lifestyle image", "Pinterest pin",
"hero/banner", "carousel", "ad creative", "Meta ads", "virtual try-on",
"model wearing", "person holding product", "closeup with hands",
"levitating/floating/splash product", "CGI/surreal product", "restyle",
"seasonal/aesthetic variation", or any product, brand, or paid-social creative.
Modes: product_shot, lifestyle_scene, closeup_product_with_person,
moodboard_pin, hero_banner, social_carousel, ad_creative_pack,
virtual_model_tryout, conceptual_product, restyle. Backend assembles the final
prompt; never freehand it.
NOT for: no-product text-to-image (use higgsfield-generate), branded avatar
video (use higgsfield-generate Marketing Studio), marketplace listing cards
(use higgsfield-marketplace-cards), Soul Character training (use
higgsfield-soul-id).


- Skill: higgsfield-product-photoshoot from higgsfield-ai/skills
- Installs: 203,069
- Install: npx skills add https://github.com/higgsfield-ai/skills --skill higgsfield-product-photoshoot
- Source: https://github.com/higgsfield-ai/skills/blob/HEAD/higgsfield-product-photoshoot/SKILL.md

## Playwright CLI

Automate browser interactions, test web pages and work with Playwright tests.

- Skill: playwright-cli from microsoft/playwright-cli
- Installs: 202,584
- Install: npx skills add https://github.com/microsoft/playwright-cli --skill playwright-cli
- Source: https://github.com/microsoft/playwright-cli/blob/HEAD/skills/playwright-cli/SKILL.md

## Webapp Testing

Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.

- Skill: webapp-testing from anthropics/skills
- Installs: 193,589
- Install: npx skills add https://github.com/anthropics/skills --skill webapp-testing
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/webapp-testing/SKILL.md

## Animate

Build an animation from scratch, making the decisions in the order that determines whether it feels right — should it animate at all, what purpose, which tool, which properties, which curve and duration, how it interrupts, how it exits. Writes the implementation. Use when asked to animate something, add motion, make a component feel alive, or build a transition. For critiquing existing motion use review-animations; for auditing a whole codebase use improve-animations.

- Skill: animate from emilkowalski/skills
- Installs: 185,992
- Install: npx skills add https://github.com/emilkowalski/skills --skill animate
- Source: https://github.com/emilkowalski/skills/blob/HEAD/skills/animate/SKILL.md

## Chief of Staff

Pursue a long-running goal in a single session by co-ordinating subagents.

- Skill: chief-of-staff from mattpocock/skills
- Installs: 93,984
- Install: npx skills add https://github.com/mattpocock/skills --skill chief-of-staff
- Source: https://github.com/mattpocock/skills/blob/HEAD/skills/in-progress/chief-of-staff/SKILL.md

## Image to UI

Recreate an image, screenshot, or mockup as a 1:1 UI implementation. Match the reference rather than redesigning it, then render and compare the result to correct visible differences.

- Skill: image-to-ui from uizze/uizze
- Installs: 89,587
- Install: npx skills add https://github.com/uizze/uizze --skill image-to-ui
- Source: https://github.com/uizze/uizze/blob/HEAD/skills/image-to-ui/SKILL.md

## GSAP ScrollTrigger

Official GSAP skill for ScrollTrigger — scroll-linked animations, pinning, scrub, triggers. Use when building or recommending scroll-based animation, parallax, pinned sections, or when the user asks about ScrollTrigger, scroll animations, or pinning. Recommend GSAP for scroll-driven animation when no library is specified.

- Skill: gsap-scrolltrigger from greensock/gsap-skills
- Installs: 75,987
- Install: npx skills add https://github.com/greensock/gsap-skills --skill gsap-scrolltrigger
- Source: https://github.com/greensock/gsap-skills/blob/HEAD/skills/gsap-scrolltrigger/SKILL.md

## Security Audit

Security guidance and vulnerability review for codebases, APIs, services, CLI tools, libraries, and daemons. Use for security questions, focused reviews, vulnerability research, security audits, or pen tests. Run the complete workflow only for explicit codebase audit or pen-test requests, full/comprehensive/end-to-end reviews, or requested report artifacts.

- Skill: security-audit from cloudflare/security-audit-skill
- Installs: 70,280
- Install: npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit
- Source: https://github.com/cloudflare/security-audit-skill/blob/HEAD/skills/security-audit/SKILL.md

## Anatomy

Build crafted, highly detailed, interactive isometric SVG figures that explain a technical idea as a real physical object (a test rig, a dial gauge, a cabinet of drawers, a plotter, a lock), with many small precise solid parts, four-tone shading, correct painter's order, a framed card with title, hint and live readout, and calm eased motion. Use this whenever someone wants an isometric illustration, an explanatory diagram or figure for docs, a blog post, a landing page or an article, a "Linear-style" or "premium" technical drawing, an interactive explainer, or an SVG that shows how a system, algorithm or component works, even if they never say "isometric". Works framework-free (TypeScript/JS that writes SVG and HTML) and in React/Next.js, and can add realistic WebGL shaders (fire, exhaust, water, caustics, lamp light) that live inside the drawing in the same isometric perspective. Also prints a figure as an A4 PDF (poster, drawing or handout) and publishes it to the Anatomy community gallery when asked.

- Skill: anatomy from wheresryan22/anatomy
- Installs: 25,575
- Install: npx skills add https://github.com/wheresryan22/anatomy --skill anatomy
- Source: https://github.com/wheresryan22/anatomy/blob/HEAD/SKILL.md

## Anti-Slop

Anti Slop: Rules for AI Coding Agents. The core filter. Load always to stop generic AI slop.

- Skill: antislop from miqdadbadjuber/anti-slop
- Installs: 8,206
- Install: npx skills add https://github.com/miqdadbadjuber/anti-slop --skill antislop
- Source: https://github.com/miqdadbadjuber/anti-slop/blob/HEAD/skills/antislop/SKILL.md

## Memory Management

Two-tier memory system that makes Claude a true workplace collaborator. Decodes shorthand, acronyms, nicknames, and internal language so Claude understands requests like a colleague would. CLAUDE.md for working memory, memory/ directory for the full knowledge base.

- Skill: memory-management from anthropics/knowledge-work-plugins
- Installs: 7,494
- Install: npx skills add https://github.com/anthropics/knowledge-work-plugins/tree/main/productivity/skills/memory-management --skill memory-management
- Source: https://github.com/anthropics/knowledge-work-plugins/blob/HEAD/productivity/skills/memory-management/SKILL.md

## Solana Vulnerability Scanner

Scans Solana programs for 6 critical vulnerabilities including arbitrary CPI, improper PDA validation, missing signer/ownership checks, and sysvar spoofing. Use when auditing Solana/Anchor programs.

- Skill: solana-vulnerability-scanner from trailofbits/skills
- Installs: 5,782
- Install: npx skills add https://github.com/trailofbits/skills/tree/main/plugins/building-secure-contracts/skills/solana-vulnerability-scanner --skill solana-vulnerability-scanner
- Source: https://github.com/trailofbits/skills/blob/HEAD/plugins/building-secure-contracts/skills/solana-vulnerability-scanner/SKILL.md

## Browser-to-API

Turn a website's observable HTTP traffic into a best-effort OpenAPI 3.1 spec by analyzing a `browser-trace` capture. Use when the user wants to discover/extract API endpoints from a browser session, build an OpenAPI doc from network traffic, or document a third-party site's XHR/fetch surface for client integration.

- Skill: browser-to-api from browserbase/skills
- Installs: 1,957
- Install: npx skills add https://github.com/browserbase/skills --skill browser-to-api
- Source: https://github.com/browserbase/skills/blob/HEAD/skills/browser-to-api/SKILL.md

## Visual Explainer

Generate self-contained HTML visual explanations for systems, code changes, plans, data, and technical concepts. Use for diagrams, architecture overviews, diff or plan reviews, project recaps, comparison tables, slide decks, animated explainers, narrated MP4 videos, and other visual explanations.

- Skill: visual-explainer from nicobailon/visual-explainer
- Installs: 802
- Install: npx skills add https://github.com/nicobailon/visual-explainer --skill visual-explainer
- Source: https://github.com/nicobailon/visual-explainer/blob/HEAD/plugins/visual-explainer/SKILL.md

## Self-Improving Agent

Meta-skill for making the agent self-improving. Covers updating AGENTS.md, creating new skills from repeated workflows, and deciding what to systematize. Invoke after completing tasks, when noticing repeated friction, or at session end.


- Skill: self-improving-agent from grail-computer/self-improving-agent
- Installs: 516
- Install: npx skills add https://github.com/grail-computer/self-improving-agent --skill self-improving-agent
- Source: https://github.com/grail-computer/self-improving-agent/blob/HEAD/skills/self-improving-agent/SKILL.md

## Obsidian Second Brain

Operate any Obsidian vault as a living, self-rewriting second brain (an evolution of Karpathy's LLM Wiki pattern: sources rewrite existing pages, contradictions reconcile automatically, scheduled agents maintain the vault while you sleep). Use this skill whenever the user asks Claude to read, write, update, search, or manage their Obsidian vault - including saving notes from conversation, creating daily entries, updating kanban boards, logging dev work, managing people notes, capturing decisions, tracking deals, or maintaining any vault structure. Also triggers when the user wants to bootstrap a new vault from scratch, run a vault health check, or drop a _CLAUDE.md into their vault so all Claude surfaces share the same operating rules. Includes a research toolkit (7 commands: /x-read, /x-pulse, /research, /research-deep, /notebooklm, /youtube, /podcast) for AI-powered research via Grok, Perplexity, NotebookLM, YouTube, and podcast feeds - findings save to the vault automatically following the AI-first vault rule. Use proactively whenever the conversation produces information worth preserving (decisions, people met, projects started, tasks completed, lessons learned, research findings).


- Skill: obsidian-second-brain from eugeniughelbur/obsidian-second-brain
- Installs: 514
- Install: npx skills add https://github.com/eugeniughelbur/obsidian-second-brain --skill obsidian-second-brain
- Source: https://github.com/eugeniughelbur/obsidian-second-brain/blob/HEAD/SKILL.md

## Agent Security Audit

Audit AI agent configurations for security risks — excessive permissions, prompt injection surfaces, data exfiltration paths, and missing guardrails. Use when reviewing CLAUDE.md files, MCP configs, agent orchestration code, or any AI agent setup.

- Skill: agent-security-audit from owasp/secure-agent-playbook
- Installs: 257
- Install: npx skills add https://github.com/owasp/secure-agent-playbook --skill agent-security-audit
- Source: https://github.com/owasp/secure-agent-playbook/blob/HEAD/plugins/ai-security-skills/skills/agent-security-audit/SKILL.md

## AgentMemory Persistent Memory

Add persistent memory to AI coding agents using agentmemory - remembers context, preferences, and decisions across sessions

- Skill: agentmemory-persistent-memory from reason-machines/ai-agent-skills
- Installs: 216
- Install: npx skills add https://github.com/reason-machines/ai-agent-skills --skill agentmemory-persistent-memory
- Source: https://github.com/reason-machines/ai-agent-skills/blob/HEAD/skills/agentmemory-persistent-memory/SKILL.md

## Competitor Teardown

Structured competitive analysis with feature matrices, SWOT, positioning maps, and UX review. Covers research frameworks, pricing comparison, review mining, and visual deliverables. Use for: market research, competitive intelligence, investor decks, product strategy, sales enablement. Triggers: competitor analysis, competitive analysis, competitor teardown, market research, competitive intelligence, swot analysis, competitor comparison, market landscape, competitor review, competitive landscape, feature comparison, market positioning

- Skill: competitor-teardown from inference-sh/skills
- Installs: 11
- Install: npx skills add https://github.com/inference-sh/skills/tree/main/guides/product/competitor-teardown --skill competitor-teardown
- Source: https://github.com/inference-sh/skills/blob/HEAD/guides/product/competitor-teardown/SKILL.md

## Reverse Engineering

Investigates shipped JavaScript, Electron, Flutter APK, WASM and SQLite artifacts and observed web features with REA: scoped analysis, source recovery, runtime observation, captures, version comparison and evidence coverage; best-effort API inference from recorded traffic with the separate Browserbase generator. Use when ordinary source is missing, a shipped package differs from source, or a feature needs artifact or runtime evidence.

- Skill: reverse-engineering from quegenx/agent-skills
- Installs: 10
- Install: npx skills add https://github.com/quegenx/agent-skills/tree/main/skills/engineering/reverse-engineering --skill reverse-engineering
- Source: https://github.com/quegenx/agent-skills/blob/HEAD/skills/engineering/reverse-engineering/SKILL.md

## AI Voice Cloning

AI voice generation, text-to-speech, and voice synthesis via inference.sh CLI. Models: Inworld TTS-2 (100+ languages, emotion/non-verbal steering), Inworld TTS 1.5 (ultra-low latency), ElevenLabs (22+ premium voices, 32 languages), Kokoro TTS, DIA, Chatterbox, Higgs, VibeVoice for natural speech. Capabilities: multiple voices, emotions, accents, long-form narration, conversation, voice transformation, delivery mode control, character voices. Use for: voiceovers, audiobooks, podcasts, video narration, accessibility, gaming NPCs, avatar audio, UGC. Triggers: voice cloning, tts, text to speech, ai voice, voice generation, voice synthesis, voice over, narration, speech synthesis, ai narrator, elevenlabs, eleven labs, natural voice, realistic speech, voice ai, voice changer, inworld, inworld tts, character voice, npc voice

- Skill: ai-voice-cloning from inference-sh/skills
- Installs: 7
- Install: npx skills add https://github.com/inference-sh/skills --skill ai-voice-cloning
- Source: https://github.com/inference-sh/skills/blob/HEAD/tools/audio/ai-voice-cloning/SKILL.md

## AI Podcast Creation

Create AI-powered podcasts with text-to-speech, music, and audio editing. Tools: Kokoro TTS, DIA TTS, Chatterbox, AI music generation, ffmpeg for audio assembly. Capabilities: multi-voice conversations, background music, intro/outro, full episodes. Use for: podcast production, audiobooks, voice content, audio newsletters. Triggers: podcast, ai podcast, text to speech podcast, audio content, voice over, ai audiobook, multi voice, conversation ai, notebooklm alternative, audio generation, podcast automation, ai narrator, voice content, audio newsletter, podcast maker

- Skill: ai-podcast-creation from inference-sh/skills
- Installs: 6
- Install: npx skills add https://github.com/inference-sh/skills/tree/main/guides/content/ai-podcast-creation --skill ai-podcast-creation
- Source: https://github.com/inference-sh/skills/blob/HEAD/guides/content/ai-podcast-creation/SKILL.md

## Reverse Engineer Anything

Investigate applications and binaries using REA; its full tooling requires separate setup.

- Skill: reverse-engineer-anything from morluto/rea
- Install: npx skills add https://github.com/morluto/rea --skill reverse-engineer-anything
- Source: https://github.com/morluto/rea/blob/HEAD/.agents/skills/reverse-engineer-anything/SKILL.md

## Office Hours

Founder-style product exploration and questioning from Garry Tan gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: office-hours from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/office-hours/SKILL.md

## Plan Ceo Review

Plan Ceo Review workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: plan-ceo-review from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/plan-ceo-review/SKILL.md

## Plan Eng Review

Plan Eng Review workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: plan-eng-review from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/plan-eng-review/SKILL.md

## Plan Design Review

Plan Design Review workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: plan-design-review from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/plan-design-review/SKILL.md

## Design Consultation

Design Consultation workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: design-consultation from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/design-consultation/SKILL.md

## Design Review

Design Review workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: design-review from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/design-review/SKILL.md

## Qa

Systematic web application QA using the gstack browser workflow. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: qa from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/qa/SKILL.md

## Qa Only

Qa Only workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: qa-only from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/qa-only/SKILL.md

## Investigate

Investigate workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: investigate from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/investigate/SKILL.md

## Review

Review workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: review from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/review/SKILL.md

## Ship

Ship workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: ship from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/ship/SKILL.md

## Retro

Retro workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: retro from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/retro/SKILL.md

## Cso

Review infrastructure, dependencies, secrets, and deployment security. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: cso from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/cso/SKILL.md

## Benchmark

Benchmark workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: benchmark from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/benchmark/SKILL.md

## Document Release

Document Release workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: document-release from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/document-release/SKILL.md

## Context Save

Context Save workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: context-save from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/context-save/SKILL.md

## Context Restore

Context Restore workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: context-restore from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/context-restore/SKILL.md

## Devex Review

Devex Review workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: devex-review from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/devex-review/SKILL.md

## Autoplan

Autoplan workflow and supporting guidance from garrytan/gstack. Install the full gstack suite and its prerequisites; this workflow uses shared tools from the suite.

- Skill: autoplan from garrytan/gstack
- Install: git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/gstack && cd ~/gstack && ./setup --host codex
- Source: https://github.com/garrytan/gstack/blob/HEAD/autoplan/SKILL.md

## Solana Dev

Foundation-maintained guidance for building and testing Solana applications and programs.

- Skill: solana-dev from solana-foundation/solana-dev-skill
- Install: npx skills add https://github.com/solana-foundation/solana-dev-skill --skill solana-dev
- Source: https://github.com/solana-foundation/solana-dev-skill/blob/HEAD/skills/solana-dev/SKILL.md

## Solana Mobile

Solana Mobile workflow and supporting guidance from solana-mobile/solana-mobile-skills.

- Skill: solana-mobile from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill solana-mobile
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/solana-mobile/SKILL.md

## Solana Mobile Wallet

Solana Mobile Wallet workflow and supporting guidance from solana-mobile/solana-mobile-skills.

- Skill: solana-mobile-wallet from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill solana-mobile-wallet
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/solana-mobile-wallet/SKILL.md

## Solana Mobile Publishing

Solana Mobile Publishing workflow and supporting guidance from solana-mobile/solana-mobile-skills.

- Skill: solana-mobile-publishing from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill solana-mobile-publishing
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/solana-mobile-publishing/SKILL.md

## Seeker Connect

Seeker Connect workflow and supporting guidance from solana-mobile/solana-mobile-skills.

- Skill: seeker-connect from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill seeker-connect
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/seeker-connect/SKILL.md

## Integration Privy

Integration Privy workflow and supporting guidance from solana-mobile/solana-mobile-skills.

- Skill: integration-privy from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill integration-privy
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/integration-privy/SKILL.md

## Docx

Docx workflow and supporting guidance from anthropics/skills.

- Skill: docx from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill docx
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/docx/SKILL.md

## Pdf

Pdf workflow and supporting guidance from anthropics/skills.

- Skill: pdf from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill pdf
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/pdf/SKILL.md

## Pptx

Pptx workflow and supporting guidance from anthropics/skills.

- Skill: pptx from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill pptx
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/pptx/SKILL.md

## Xlsx

Xlsx workflow and supporting guidance from anthropics/skills.

- Skill: xlsx from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill xlsx
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/xlsx/SKILL.md

## Mcp Builder

Mcp Builder workflow and supporting guidance from anthropics/skills.

- Skill: mcp-builder from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill mcp-builder
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/mcp-builder/SKILL.md

## Algorithmic Art

Algorithmic Art workflow and supporting guidance from anthropics/skills.

- Skill: algorithmic-art from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill algorithmic-art
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/algorithmic-art/SKILL.md

## Doc Coauthoring

Doc Coauthoring workflow and supporting guidance from anthropics/skills.

- Skill: doc-coauthoring from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill doc-coauthoring
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/doc-coauthoring/SKILL.md

## Canvas Design

Canvas Design workflow and supporting guidance from anthropics/skills.

- Skill: canvas-design from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill canvas-design
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/canvas-design/SKILL.md

## Brainstorming

Brainstorming workflow and supporting guidance from obra/superpowers.

- Skill: brainstorming from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill brainstorming
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/brainstorming/SKILL.md

## Writing Plans

Writing Plans workflow and supporting guidance from obra/superpowers.

- Skill: writing-plans from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill writing-plans
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/writing-plans/SKILL.md

## Verification Before Completion

Verification Before Completion workflow and supporting guidance from obra/superpowers.

- Skill: verification-before-completion from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill verification-before-completion
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/verification-before-completion/SKILL.md

## Requesting Code Review

Requesting Code Review workflow and supporting guidance from obra/superpowers.

- Skill: requesting-code-review from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill requesting-code-review
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/requesting-code-review/SKILL.md

## Using Git Worktrees

Using Git Worktrees workflow and supporting guidance from obra/superpowers.

- Skill: using-git-worktrees from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill using-git-worktrees
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/using-git-worktrees/SKILL.md

## Huggingface Datasets

Huggingface Datasets workflow and supporting guidance from huggingface/skills.

- Skill: huggingface-datasets from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-datasets
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-datasets/SKILL.md

## Huggingface Gradio

Huggingface Gradio workflow and supporting guidance from huggingface/skills.

- Skill: huggingface-gradio from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-gradio
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-gradio/SKILL.md

## Huggingface Local Models

Huggingface Local Models workflow and supporting guidance from huggingface/skills.

- Skill: huggingface-local-models from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-local-models
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-local-models/SKILL.md

## Huggingface Spaces

Huggingface Spaces workflow and supporting guidance from huggingface/skills.

- Skill: huggingface-spaces from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-spaces
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-spaces/SKILL.md

## Huggingface Llm Trainer

Huggingface Llm Trainer workflow and supporting guidance from huggingface/skills.

- Skill: huggingface-llm-trainer from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-llm-trainer
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-llm-trainer/SKILL.md

## Transformers Js

Transformers Js workflow and supporting guidance from huggingface/skills.

- Skill: transformers-js from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill transformers-js
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/transformers-js/SKILL.md

## Vercel React Native Skills

React Native and Expo best practices for building performant mobile apps. Use

- Skill: vercel-react-native-skills from vercel-labs/agent-skills
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-native-skills
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/react-native-skills/SKILL.md

## Vercel React View Transitions

Guide for implementing smooth, native-feeling animations using React

- Skill: vercel-react-view-transitions from vercel-labs/agent-skills
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-view-transitions
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/react-view-transitions/SKILL.md

## Writing Guidelines

Review docs/prose for Writing Guidelines compliance. Use when asked to

- Skill: writing-guidelines from vercel-labs/agent-skills
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill writing-guidelines
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/writing-guidelines/SKILL.md

## Vercel Optimize

Use for Vercel cost and performance optimization on deployed projects, especially Next.js, SvelteKit, Nuxt, and limited Astro apps. Collect Vercel metrics, usage, project config, and code scan results first; investigate only metric-backed candidates; produce ranked recommendations grounded in verified files and version-aware Vercel/framework docs. Trigger for Vercel bill reduction, slow or expensive routes, caching opportunities, Function Invocations, Build Minutes, Fast Data Transfer, Core Web Vitals, Bot Management, Fluid compute, or cost breakdown requests.

- Skill: vercel-optimize from vercel-labs/agent-skills
- Install: npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-optimize
- Source: https://github.com/vercel-labs/agent-skills/blob/HEAD/skills/vercel-optimize/SKILL.md

## Brand Guidelines

Applies Anthropic

- Skill: brand-guidelines from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill brand-guidelines
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/brand-guidelines/SKILL.md

## Internal Comms

A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to write some sort of internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates, etc.).

- Skill: internal-comms from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill internal-comms
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/internal-comms/SKILL.md

## Theme Factory

Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly.

- Skill: theme-factory from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill theme-factory
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/theme-factory/SKILL.md

## Web Artifacts Builder

Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts.

- Skill: web-artifacts-builder from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill web-artifacts-builder
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/web-artifacts-builder/SKILL.md

## Skill Creator

Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill

- Skill: skill-creator from anthropics/skills
- Install: npx skills add https://github.com/anthropics/skills --skill skill-creator
- Source: https://github.com/anthropics/skills/blob/HEAD/skills/skill-creator/SKILL.md

## Executing Plans

Use when executing an implementation plan in the current session as the implementer yourself — your human partner chose inline execution, or no subagent tool is available

- Skill: executing-plans from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill executing-plans
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/executing-plans/SKILL.md

## Receiving Code Review

Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation

- Skill: receiving-code-review from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill receiving-code-review
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/receiving-code-review/SKILL.md

## Finishing A Development Branch

Use when implementation is complete, all tests pass, and you need to decide how to integrate the work

- Skill: finishing-a-development-branch from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill finishing-a-development-branch
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/finishing-a-development-branch/SKILL.md

## Writing Skills

Use when creating new skills, editing existing skills, or verifying skills work before deployment

- Skill: writing-skills from obra/superpowers
- Install: npx skills add https://github.com/obra/superpowers --skill writing-skills
- Source: https://github.com/obra/superpowers/blob/HEAD/skills/writing-skills/SKILL.md

## Hf Cli

Hugging Face Hub CLI (`hf`) for downloading, uploading, and managing models, datasets, spaces, buckets, repos, papers, jobs, and more on the Hugging Face Hub. Use when: handling authentication; managing local cache; managing Hugging Face Buckets; running or scheduling jobs on Hugging Face infrastructure; managing Hugging Face repos; discussions and pull requests; browsing models, datasets and spaces; reading, searching, or browsing academic papers; managing collections; querying datasets; configuring spaces; setting up webhooks; or deploying and managing HF Inference Endpoints. Make sure to use this skill whenever the user mentions

- Skill: hf-cli from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill hf-cli
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/hf-cli/SKILL.md

## Huggingface Papers

Look up and read Hugging Face paper pages in markdown, and use the papers API for structured metadata such as authors, linked models/datasets/spaces, Github repo and project page. Use when the user shares a Hugging Face paper page URL, an arXiv URL or ID, or asks to summarize, explain, or analyze an AI research paper.

- Skill: huggingface-papers from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-papers
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-papers/SKILL.md

## Huggingface Community Evals

Run evaluations for Hugging Face Hub models using inspect-ai and lighteval on local hardware. Use for backend selection, local GPU evals, and choosing between vLLM / Transformers / accelerate. Not for HF Jobs orchestration, model-card PRs, .eval_results publication, or community-evals automation.

- Skill: huggingface-community-evals from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill huggingface-community-evals
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/huggingface-community-evals/SKILL.md

## Trl Training

Post-train LLMs with TRL (Transformers Reinforcement Learning) — SFT, DPO, GRPO, KTO, and reward-model training. Use when writing or debugging training code with the TRL Python API or the trl CLI.

- Skill: trl-training from huggingface/skills
- Install: npx skills add https://github.com/huggingface/skills --skill trl-training
- Source: https://github.com/huggingface/skills/blob/HEAD/skills/trl-training/SKILL.md

## Seeker Domains

Resolve and display .skr domain names in Solana mobile apps, in both directions between names and wallet addresses. Use when showing .skr names instead of wallet addresses in profiles, friend lists, or transaction history, resolving a .skr domain to an address, reverse-looking-up an address to a domain, or validating .skr input.

- Skill: seeker-domains from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill seeker-domains
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/seeker-domains/SKILL.md

## Seeker Genesis Token

Verify Seeker device ownership by checking for the Seeker Genesis Token (SGT) with Sign-in-with-Solana and server-side token verification. Use when gating content or rewards to Seeker owners, verifying a user holds an SGT, adding anti-Sybil checks to a Solana mobile app, or implementing one-claim-per-device logic.

- Skill: seeker-genesis-token from solana-mobile/solana-mobile-skills
- Install: npx skills add https://github.com/solana-mobile/solana-mobile-skills --skill seeker-genesis-token
- Source: https://github.com/solana-mobile/solana-mobile-skills/blob/HEAD/skills/seeker-genesis-token/SKILL.md

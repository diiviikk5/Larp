// Below the hero: download, how to get connected, and how to host a space on a server.
// Download links come from site/src/release.ts, so a new release only changes one file.
import { RELEASE } from './release';

export function Download() {
  return (
    <div className="below">
      <section id="download" className="block">
        <span className="block-index">N°02 — DOWNLOAD</span>
        <h2>Larp {RELEASE.version}</h2>
        <p className="block-lead">The desktop app is the workbench and runs your agents on your own computer. Each person installs it once.</p>
        <div className="downloads">
          <a className="dl primary" href={RELEASE.windows} download>
            <strong>Windows</strong>
            <span>Installer · x64 · {RELEASE.windowsSize}</span>
          </a>
          <div className="dl muted">
            <strong>macOS · Linux</strong>
            <span>Build from source for now: <code>npm install && npm run dist:mac</code> (or <code>dist:linux</code>)</span>
          </div>
        </div>
        <p className="fine">The installer isn't code-signed yet, so Windows SmartScreen may warn you. Choose <em>More info → Run anyway</em>. It sends nothing anywhere until you create or join a space.</p>
      </section>

      <section id="docs" className="block">
        <span className="block-index">N°03 — GET STARTED</span>
        <h2>Three steps to a shared space</h2>
        <ol className="steps">
          <li><b>Install and open Larp.</b> Choose <em>Create a space</em> to host it on your laptop, or <em>Join a space</em> with an address and a code.</li>
          <li><b>Add an agent.</b> Claude Code, Codex, a local model (Ollama, LM Studio) or Hermes, using your own sign-in. It runs on your machine, in an isolated copy of your repo.</li>
          <li><b>Invite people.</b> Create an invite code and share it with the space's address. They delegate to your agent; you approve before anything runs.</li>
        </ol>
        <p className="fine">On the same Wi-Fi, use the laptop's address (Settings → Network → allow other devices). Across the internet, host the space on a server, below.</p>
      </section>

      <section id="host" className="block">
        <span className="block-index">N°04 — HOST A SPACE</span>
        <h2>Put your space online</h2>
        <p className="block-lead">A hosted space keeps the shared state (people, tasks, approvals) on a server, so everyone can reach it from anywhere. Agents still run on each person's computer and connect out to it.</p>
        <ol className="steps">
          <li><b>Deploy the server.</b> The repo has a <code>Dockerfile</code> and a Render blueprint (<code>render.yaml</code>). Any host that runs Docker works.</li>
          <li><b>Give it storage.</b> Set <code>YUGABYTE_URL</code> to a YugabyteDB cluster so the space survives restarts. Add <code>MEKO_API_KEY</code> to give agents memory across days.</li>
          <li><b>Claim it.</b> The server prints a one-time setup code. In Larp choose <em>Join a space</em>, enter the server's https address and that code, and the space is yours. Invite everyone else from there.</li>
        </ol>
      </section>

      <footer className="foot">
        <span>LARP — people, agents, proof.</span>
        <span><a href="./skills.html">Skills →</a>  <a href="./apps.html">Apps →</a></span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </div>
  );
}

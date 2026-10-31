package main

// Rendering: an ASCII banner with a moving sea (like Larp's Ocean mode), tabs, and one view per tab.

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	ink     = lipgloss.Color("#e8eef2")
	dim     = lipgloss.Color("#7c8a96")
	faint   = lipgloss.Color("#4a5560")
	sea     = lipgloss.Color("#3fb6d3")
	foam    = lipgloss.Color("#a8e6f0")
	coral   = lipgloss.Color("#ff8a65")
	good    = lipgloss.Color("#5fd38d")
	warn    = lipgloss.Color("#f5c062")
	bad     = lipgloss.Color("#ff6b6b")
	violet  = lipgloss.Color("#b39ddb")
	bold    = lipgloss.NewStyle().Bold(true).Foreground(ink)
	muted   = lipgloss.NewStyle().Foreground(dim)
	ghost   = lipgloss.NewStyle().Foreground(faint)
	accent  = lipgloss.NewStyle().Foreground(sea).Bold(true)
	section = lipgloss.NewStyle().Foreground(foam).Bold(true)
	panel   = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(faint).Padding(0, 1)
	chosen  = lipgloss.NewStyle().Foreground(ink).Background(lipgloss.Color("#173a47")).Bold(true)
)

const logo = `█   ▄▀█ █▀█ █▀█
█▄▄ █▀█ █▀▄ █▀▀`

type tickMsg time.Time

func tick() tea.Cmd {
	return tea.Tick(180*time.Millisecond, func(t time.Time) tea.Msg { return tickMsg(t) })
}

// waves draws two rows of moving sea, with the odd fish swimming through.
func waves(width, frame int) string {
	glyphs := []rune("~∼≈∽~-")
	var top, bottom strings.Builder
	for x := 0; x < width; x++ {
		top.WriteRune(glyphs[(x+frame)%len(glyphs)])
		b := glyphs[(x*2+len(glyphs)-frame%len(glyphs))%len(glyphs)]
		bottom.WriteRune(b)
	}
	row1, row2 := []rune(top.String()), []rune(bottom.String())
	fish := []rune("><>")
	if width > 20 {
		pos := (frame / 2) % (width + 6)
		for i, r := range fish {
			if p := pos + i - 3; p >= 0 && p < width {
				row2[p] = r
			}
		}
		turtle := []rune("<°)))")
		pos = width - ((frame / 3) % (width + 8))
		for i, r := range turtle {
			if p := pos + i; p >= 0 && p < width {
				row1[p] = r
			}
		}
	}
	return lipgloss.NewStyle().Foreground(sea).Render(string(row1)) + "\n" + lipgloss.NewStyle().Foreground(foam).Faint(true).Render(string(row2))
}

func statusStyle(s string) (string, lipgloss.Color) {
	switch s {
	case "awaiting_approval":
		return "needs approval", warn
	case "queued":
		return "queued", dim
	case "running":
		return "working", sea
	case "waiting":
		return "asked an agent", violet
	case "needs_review":
		return "ready for review", foam
	case "accepted":
		return "accepted", good
	case "applied":
		return "merged", good
	case "failed", "apply_failed", "interrupted":
		return strings.ReplaceAll(s, "_", " "), bad
	case "denied", "cancelled":
		return s, faint
	}
	return s, dim
}

func badge(s string) string {
	label, color := statusStyle(s)
	return lipgloss.NewStyle().Foreground(color).Render("● " + label)
}

func clip(s string, n int) string {
	s = strings.ReplaceAll(strings.TrimSpace(s), "\n", " ")
	r := []rune(s)
	if n > 1 && len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}

func wrap(s string, width int) string {
	return lipgloss.NewStyle().Width(max(20, width)).Render(s)
}

func (m model) View() string {
	if m.width == 0 {
		return "starting…"
	}
	if m.state == nil {
		msg := "connecting to " + m.client.URL + "…"
		if m.err != nil {
			msg = "can't reach the space: " + m.err.Error()
		}
		return "\n  " + accent.Render(logo) + "\n\n  " + muted.Render(msg) + "\n\n  " + ghost.Render("q quit")
	}
	var b strings.Builder
	b.WriteString(m.header())
	b.WriteString("\n")
	body := ""
	if m.detail != "" {
		body = m.view.View()
	} else {
		switch m.tab {
		case tabTasks:
			body = m.tasksView()
		case tabApprovals:
			body = m.approvalsView()
		case tabNew:
			body = m.newTaskView()
		case tabAgents:
			body = m.agentsView()
		case tabMemory:
			body = m.memoryView()
		case tabActivity:
			body = m.activityView()
		}
	}
	lines := strings.Split(body, "\n")
	room := m.height - lipgloss.Height(b.String()) - 2
	if len(lines) > room && room > 0 {
		lines = lines[:room]
	}
	b.WriteString(strings.Join(lines, "\n"))
	used := lipgloss.Height(b.String())
	if pad := m.height - used - 1; pad > 0 {
		b.WriteString(strings.Repeat("\n", pad))
	}
	b.WriteString("\n" + m.footer())
	return b.String()
}

func (m model) header() string {
	sp := m.currentSpace()
	spaceName := "no space"
	if sp != nil {
		spaceName = sp.Name + " · " + sp.Kind
	}
	meko := lipgloss.NewStyle().Foreground(bad).Render("meko off")
	if m.state.Memory.On {
		meko = lipgloss.NewStyle().Foreground(good).Render("meko on")
	} else if !m.state.Memory.Configured {
		meko = ghost.Render("meko not set up")
	}
	tg := ""
	if m.state.Telegram != nil && m.state.Telegram.Connected {
		tg = muted.Render(" · telegram @" + m.state.Telegram.BotName)
	}
	right := lipgloss.JoinVertical(lipgloss.Right,
		bold.Render(spaceName),
		muted.Render(m.state.Me.Name+" · ")+meko+tg,
	)
	left := accent.Render(logo)
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right) - 2
	top := lipgloss.JoinHorizontal(lipgloss.Top, " ", left, strings.Repeat(" ", max(1, gap)), right)

	var tabs []string
	for i, name := range tabNames {
		label := fmt.Sprintf(" %d %s ", i+1, name)
		if i == tabApprovals && len(m.state.Approvals) > 0 {
			label = fmt.Sprintf(" %d %s (%d) ", i+1, name, len(m.state.Approvals))
		}
		if i == m.tab && m.detail == "" {
			tabs = append(tabs, chosen.Render(label))
		} else {
			tabs = append(tabs, muted.Render(label))
		}
	}
	return top + "\n" + waves(m.width, m.frame) + "\n" + strings.Join(tabs, ghost.Render("│"))
}

func (m model) footer() string {
	keys := "1-6/tab switch · ↑↓ move · enter open · s space · q quit"
	switch {
	case m.revising:
		keys = "type your feedback · ctrl+s send · esc cancel"
	case m.detail != "":
		keys = "a accept · r ask for changes · o open the other agent's task · ↑↓ scroll · esc back"
	case m.tab == tabApprovals:
		keys = "y approve · n deny · ↑↓ move · tab switch · q quit"
	case m.tab == tabNew:
		keys = "tab next field · ↑↓ pick agent · ←→ code/answer · ctrl+s send · esc leave field"
	case m.tab == tabMemory:
		keys = "m turn Meko memory on/off · tab switch · q quit"
	}
	line := ghost.Render(keys)
	if m.flash != "" {
		color := good
		if strings.HasPrefix(m.flash, "✗") {
			color = bad
		}
		line = lipgloss.NewStyle().Foreground(color).Render(m.flash) + ghost.Render("   "+keys)
	}
	return " " + line
}

// ---------- tabs ----------

func (m model) tasksView() string {
	ts := m.spaceTasks()
	if len(ts) == 0 {
		return "\n  " + muted.Render("No tasks here yet. Press 3 to send one.")
	}
	var b strings.Builder
	b.WriteString("\n")
	for i, t := range ts {
		who := m.agentName(t.AgentID)
		extra := ""
		if t.ParentID != "" {
			extra = colorText(violet).render("  ↳ asked by " + m.agentName(t.AskedBy))
		} else if len(t.Asks) > 0 {
			extra = colorText(violet).render(fmt.Sprintf("  ⇄ asked %s", t.Asks[len(t.Asks)-1].To))
		}
		line := fmt.Sprintf(" %-14s %-48s %s%s", clip(who, 14), clip(t.Title, 48), badge(t.Status), extra)
		if i == m.cursor[tabTasks] {
			b.WriteString(chosen.Render("▸"+line) + "\n")
		} else {
			b.WriteString(" " + line + "\n")
		}
	}
	return b.String()
}

func (m model) approvalsView() string {
	if len(m.state.Approvals) == 0 {
		return "\n  " + muted.Render("Nothing waiting for you. Requests to run your agents land here.")
	}
	var b strings.Builder
	b.WriteString("\n")
	for i, a := range m.state.Approvals {
		box := panel
		if i == m.cursor[tabApprovals] {
			box = box.BorderForeground(warn)
		}
		b.WriteString(box.Width(min(m.width-4, 100)).Render(bold.Render("🔔 "+a.Title)+"\n"+muted.Render(wrap(a.Detail, min(m.width-8, 96)))) + "\n")
	}
	return b.String()
}

func (m model) newTaskView() string {
	sp := m.currentSpace()
	if sp == nil {
		return ""
	}
	agents := m.spaceAgents()
	label := func(i int, text string) string {
		if m.focus == i {
			return accent.Render("▸ " + text)
		}
		return muted.Render("  " + text)
	}
	var b strings.Builder
	b.WriteString("\n" + label(0, "Agent") + "\n")
	if len(agents) == 0 {
		b.WriteString("    " + muted.Render("No agents in this space yet. Add one in the Larp app.") + "\n")
	}
	for i, a := range agents {
		dot := ghost.Render("○")
		if a.Online {
			dot = lipgloss.NewStyle().Foreground(good).Render("●")
		}
		row := fmt.Sprintf("%s %-12s %s", dot, a.Name, muted.Render(fmt.Sprintf("%s's · %s%s", m.personName(a.OwnerID), a.Runtime, map[bool]string{true: " · " + a.Model, false: ""}[a.Model != ""])))
		if i == m.agentCursor {
			b.WriteString("    " + chosen.Render(" "+row+" ") + "\n")
		} else {
			b.WriteString("     " + row + "\n")
		}
	}
	if sp.Kind == "build" {
		code, answer := " code changes ", " just an answer "
		if m.answerOnly {
			answer = chosen.Render(answer)
			code = muted.Render(code)
		} else {
			code = chosen.Render(code)
			answer = muted.Render(answer)
		}
		b.WriteString("\n" + label(1, "What you want back") + "   " + code + " " + answer + "\n")
	}
	b.WriteString("\n" + label(2, "Instructions") + "\n" + indent(m.instructions.View(), 4) + "\n")
	if sp.Kind == "build" && !m.answerOnly {
		b.WriteString("\n" + label(3, "Check command (runs on the agent owner's computer)") + "\n    " + m.check.View() + "\n")
	}
	b.WriteString("\n    " + ghost.Render("ctrl+s sends it. Other people's agents need their owner's approval first."))
	return b.String()
}

func (m model) agentsView() string {
	agents := m.spaceAgents()
	if len(agents) == 0 {
		return "\n  " + muted.Render("No agents here yet.")
	}
	var b strings.Builder
	b.WriteString("\n")
	for i, a := range agents {
		state := ghost.Render("○ offline")
		if a.Busy {
			state = lipgloss.NewStyle().Foreground(sea).Render("◉ working")
		} else if a.Online {
			state = lipgloss.NewStyle().Foreground(good).Render("● online")
		}
		model := a.Model
		if model == "" {
			model = "default model"
		}
		apps := ""
		if a.UsesApps {
			apps = lipgloss.NewStyle().Foreground(coral).Render("  reads Swasthya + Kosh")
		}
		repo := a.Repo
		if repo == "" {
			repo = "no repo"
		}
		line := fmt.Sprintf(" %-12s %-10s %-22s %-12s %s%s", a.Name, clip(m.personName(a.OwnerID), 10), clip(a.Runtime+" · "+model, 22), clip(repo, 12), state, apps)
		if i == m.cursor[tabAgents] {
			b.WriteString(chosen.Render("▸"+line) + "\n")
		} else {
			b.WriteString(" " + line + "\n")
		}
	}
	return b.String()
}

func (m model) memoryView() string {
	mem := m.state.Memory
	var b strings.Builder
	state := lipgloss.NewStyle().Foreground(good).Render("ON: agents recall before working and remember after")
	if !mem.On {
		state = lipgloss.NewStyle().Foreground(bad).Render("OFF: agents see only the task (press m to compare)")
	}
	if !mem.Configured {
		state = ghost.Render("not set up: add MEKO_API_KEY on the computer that hosts the space")
	}
	b.WriteString("\n " + section.Render("Meko memory  ") + state + "\n\n")
	saved := int(mem.Totals["saved"])
	recalls := int(mem.Totals["recalls"])
	b.WriteString(fmt.Sprintf(" %s tokens saved by recall   %s recalls   %s calls logged\n\n",
		accent.Render(fmt.Sprintf("%d", saved)), accent.Render(fmt.Sprintf("%d", recalls)), accent.Render(fmt.Sprintf("%d", len(mem.Calls)))))
	if len(mem.Royalties) > 0 {
		b.WriteString(" " + section.Render("Knowledge royalties") + muted.Render("  whose memories saved others the most") + "\n")
		for author, r := range mem.Royalties {
			name := author
			if strings.HasPrefix(author, "person:") {
				name = m.personName(strings.TrimPrefix(author, "person:"))
			} else if strings.HasPrefix(author, "agent:") {
				name = m.agentName(strings.TrimPrefix(author, "agent:"))
			}
			bar := strings.Repeat("█", min(30, r.Saved/200+1))
			b.WriteString(fmt.Sprintf("   %-12s %s %s\n", clip(name, 12), lipgloss.NewStyle().Foreground(warn).Render(bar), muted.Render(fmt.Sprintf("%d tokens · %d reuses", r.Saved, r.Reuses))))
		}
		b.WriteString("\n")
	}
	b.WriteString(" " + section.Render("Latest Meko calls") + "\n")
	calls := mem.Calls
	if len(calls) == 0 {
		b.WriteString("   " + muted.Render("None yet. They appear as agents work.") + "\n")
	}
	for i := len(calls) - 1; i >= 0 && i >= len(calls)-14; i-- {
		c := calls[i]
		arrow := ""
		if c.To != "" {
			arrow = lipgloss.NewStyle().Foreground(violet).Render(" → " + c.To)
		}
		okMark := lipgloss.NewStyle().Foreground(good).Render("✓")
		if !c.OK {
			okMark = lipgloss.NewStyle().Foreground(bad).Render("✗")
		}
		b.WriteString(fmt.Sprintf("   %s %-8s %-22s %s%s %s\n", okMark, clip(c.Kind, 8), clip(c.Tool, 22), muted.Render(clip(c.Agent, 10)), arrow, ghost.Render(clip(c.Summary, max(10, m.width-70)))))
	}
	return b.String()
}

func (m model) activityView() string {
	sp := m.currentSpace()
	var b strings.Builder
	b.WriteString("\n")
	events := m.state.Events
	shown := 0
	for i := len(events) - 1; i >= 0 && shown < m.height-10; i-- {
		e := events[i]
		at := e.At
		if t, err := time.Parse(time.RFC3339, e.At); err == nil {
			at = t.Local().Format("15:04")
		}
		who := ""
		if e.Actor != "" {
			who = m.personName(e.Actor) + " "
		}
		_ = sp
		b.WriteString(fmt.Sprintf(" %s  %s%s\n", ghost.Render(at), bold.Render(who), muted.Render(clip(e.Text, m.width-16))))
		shown++
	}
	if shown == 0 {
		b.WriteString("  " + muted.Render("Nothing yet."))
	}
	return b.String()
}

// ---------- one task ----------

func (m *model) refreshDetail() {
	if m.detail == "" || m.state == nil {
		return
	}
	t := m.task(m.detail)
	if t == nil {
		m.view.SetContent(muted.Render("This task is gone."))
		return
	}
	w := max(40, m.width-6)
	var b strings.Builder
	b.WriteString(bold.Render(t.Title) + "   " + badge(t.Status) + "\n")
	b.WriteString(muted.Render(fmt.Sprintf("%s (%s's agent) · asked by %s · %s", m.agentName(t.AgentID), m.personName(t.OwnerID), m.personName(t.CreatedBy), t.Kind)) + "\n\n")

	if t.ParentID != "" {
		parent := m.task(t.ParentID)
		title := ""
		if parent != nil {
			title = parent.Title
		}
		b.WriteString(section.Render("⇄ Request from another agent") + "\n")
		b.WriteString(wrap(fmt.Sprintf("%s is working on “%s” and asked for this. The answer goes back to it automatically (o opens it).", m.agentName(t.AskedBy), title), w) + "\n\n")
	}
	if len(t.Asks) > 0 {
		b.WriteString(section.Render("⇄ Agent conversation") + "\n")
		for _, a := range t.Asks {
			b.WriteString(lipgloss.NewStyle().Foreground(violet).Render(fmt.Sprintf("  %s → %s", m.agentName(t.AgentID), a.To)) + "\n")
			b.WriteString(indent(wrap(clip(a.Text, 700), w-6), 4) + "\n")
			if a.Answered && a.Answer != nil {
				head := fmt.Sprintf("  %s → %s", a.To, m.agentName(t.AgentID))
				if len(a.Answer.Files) > 0 {
					head += "  (changed " + strings.Join(a.Answer.Files, ", ") + ")"
				}
				color := good
				if !a.Answer.OK {
					color = bad
				}
				b.WriteString(lipgloss.NewStyle().Foreground(color).Render(head) + "\n")
				b.WriteString(indent(wrap(clip(a.Answer.Text, 900), w-6), 4) + "\n")
			} else {
				b.WriteString(ghost.Render("    waiting for "+a.To+"…") + "\n")
			}
		}
		b.WriteString("\n")
	}
	if t.Context != nil && len(t.Context.Items) > 0 {
		head := "Recalled from Meko"
		if t.Context.Saved > 0 {
			head += fmt.Sprintf("  (saved %d tokens)", t.Context.Saved)
		}
		b.WriteString(section.Render(head) + "\n")
		for _, it := range t.Context.Items {
			b.WriteString(fmt.Sprintf("  %s %s\n", lipgloss.NewStyle().Foreground(coral).Render("["+it.Source+" · "+clip(it.From, 16)+"]"), muted.Render(clip(it.Text, w-30))))
		}
		b.WriteString("\n")
	} else if t.Context != nil && t.Context.Status == "off" {
		b.WriteString(ghost.Render("Meko memory was off: the agent saw only the task.") + "\n\n")
	}
	if t.Result != nil {
		b.WriteString(section.Render("Result") + "\n")
		if t.Result.Error != "" {
			b.WriteString(lipgloss.NewStyle().Foreground(bad).Render(wrap(clip(t.Result.Error, 900), w)) + "\n")
		} else {
			b.WriteString(wrap(t.Result.Summary, w) + "\n")
		}
		if len(t.Result.Files) > 0 {
			b.WriteString(muted.Render("files: "+strings.Join(t.Result.Files, ", ")) + "\n")
		}
		if t.Result.Check != nil {
			if t.Result.Check.Passed {
				b.WriteString(lipgloss.NewStyle().Foreground(good).Render("✓ check passed: "+t.Result.Check.Command) + "\n")
			} else {
				b.WriteString(lipgloss.NewStyle().Foreground(bad).Render("✗ check failed: "+t.Result.Check.Command) + "\n")
			}
		}
		b.WriteString("\n")
	}
	if len(t.Log) > 0 {
		b.WriteString(section.Render("Log") + "\n")
		start := max(0, len(t.Log)-18)
		for _, l := range t.Log[start:] {
			b.WriteString(fmt.Sprintf("  %s %s\n", ghost.Render(fmt.Sprintf("%-5s", l.Kind)), clip(l.Text, w-10)))
		}
	}
	if m.revising {
		b.WriteString("\n" + section.Render("Ask for changes") + "\n" + m.feedback.View() + "\n")
	}
	m.view.SetContent(b.String())
	if m.revising {
		m.view.GotoBottom()
	}
}

func indent(s string, n int) string {
	pad := strings.Repeat(" ", n)
	return pad + strings.ReplaceAll(s, "\n", "\n"+pad)
}

type colorText lipgloss.Color

func (c colorText) render(s string) string { return lipgloss.NewStyle().Foreground(lipgloss.Color(c)).Render(s) }

package main

// The interactive model: tabs for tasks, approvals, a new task, agents, Meko memory and activity.

import (
	"context"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

const (
	tabTasks = iota
	tabApprovals
	tabNew
	tabAgents
	tabMemory
	tabActivity
)

var tabNames = []string{"Tasks", "Approvals", "New task", "Agents", "Memory", "Activity"}

type stateMsg struct {
	state *State
	err   error
}
type changedMsg struct{}
type flashMsg string
type clearFlashMsg struct{}

type model struct {
	client  *Client
	state   *State
	err     error
	width   int
	height  int
	tab     int
	space   int // index into state.Spaces
	cursor  [6]int
	detail  string // open task id
	view    viewport.Model
	flash   string
	frame   int // the sea in the banner moves
	changes chan struct{}

	// Asking for changes on a result.
	revising bool
	feedback textarea.Model

	// The New task form: 0 agent, 1 kind, 2 instructions, 3 check.
	focus        int
	agentCursor  int
	answerOnly   bool
	instructions textarea.Model
	check        textinput.Model
}

func newModel(c *Client) model {
	fb := textarea.New()
	fb.Placeholder = "What should change?"
	fb.ShowLineNumbers = false
	ins := textarea.New()
	ins.Placeholder = "Describe what you want. Agents can ask other agents for help while they work."
	ins.ShowLineNumbers = false
	chk := textinput.New()
	chk.Placeholder = "npm test"
	chk.Prompt = "$ "
	return model{client: c, changes: make(chan struct{}, 1), feedback: fb, instructions: ins, check: chk, view: viewport.New(80, 20)}
}

func (m model) fetch() tea.Cmd {
	return func() tea.Msg {
		s, err := m.client.State()
		return stateMsg{s, err}
	}
}

func (m model) waitForChange() tea.Cmd {
	return func() tea.Msg {
		<-m.changes
		time.Sleep(120 * time.Millisecond) // let a burst of changes settle
		return changedMsg{}
	}
}

func flash(text string) tea.Cmd {
	return tea.Batch(func() tea.Msg { return flashMsg(text) }, tea.Tick(4*time.Second, func(time.Time) tea.Msg { return clearFlashMsg{} }))
}

func (m model) Init() tea.Cmd {
	changes := m.changes
	go m.client.Stream(context.Background(), func() {
		select {
		case changes <- struct{}{}:
		default:
		}
	})
	return tea.Batch(m.fetch(), m.waitForChange(), textarea.Blink, tick())
}

// ---------- what the views list ----------

func (m model) currentSpace() *Space {
	if m.state == nil || len(m.state.Spaces) == 0 {
		return nil
	}
	if m.space >= len(m.state.Spaces) {
		return &m.state.Spaces[0]
	}
	return &m.state.Spaces[m.space]
}

func (m model) spaceTasks() []Task {
	sp := m.currentSpace()
	if sp == nil {
		return nil
	}
	var out []Task
	for _, t := range m.state.Tasks {
		if t.SpaceID == sp.ID {
			out = append(out, t)
		}
	}
	return out
}

func (m model) spaceAgents() []Agent {
	sp := m.currentSpace()
	if sp == nil {
		return nil
	}
	var out []Agent
	for _, a := range m.state.Agents {
		for _, id := range a.SpaceIDs {
			if id == sp.ID {
				out = append(out, a)
				break
			}
		}
	}
	return out
}

func (m model) task(id string) *Task {
	if m.state == nil {
		return nil
	}
	for i := range m.state.Tasks {
		if m.state.Tasks[i].ID == id {
			return &m.state.Tasks[i]
		}
	}
	return nil
}

func (m model) agentName(id string) string {
	for _, a := range m.state.Agents {
		if a.ID == id {
			return a.Name
		}
	}
	return "agent"
}

func (m model) personName(id string) string {
	for _, p := range m.state.People {
		if p.ID == id {
			return p.Name
		}
	}
	return "someone"
}

func (m model) myOnlineHost() string {
	for _, h := range m.state.Hosts {
		if h.OwnerID == m.state.Me.ID && h.Online {
			return h.ID
		}
	}
	return ""
}

func (m model) editing() bool {
	return m.revising || (m.tab == tabNew && (m.focus == 2 || m.focus == 3))
}

// ---------- updates ----------

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.view.Width, m.view.Height = msg.Width-4, msg.Height-9
		m.feedback.SetWidth(msg.Width - 8)
		m.feedback.SetHeight(4)
		m.instructions.SetWidth(msg.Width - 8)
		m.instructions.SetHeight(7)
		m.refreshDetail()
		return m, nil
	case stateMsg:
		if msg.err != nil {
			m.err = msg.err
		} else {
			m.state, m.err = msg.state, nil
		}
		m.refreshDetail()
		return m, nil
	case changedMsg:
		return m, tea.Batch(m.fetch(), m.waitForChange())
	case flashMsg:
		m.flash = string(msg)
		return m, nil
	case tickMsg:
		m.frame++
		return m, tick()
	case clearFlashMsg:
		m.flash = ""
		return m, nil
	case tea.KeyMsg:
		return m.key(msg)
	}
	return m, nil
}

func (m model) act(label string, fn func() error) tea.Cmd {
	return func() tea.Msg {
		if err := fn(); err != nil {
			return flashMsg("✗ " + err.Error())
		}
		return flashMsg("✓ " + label)
	}
}

func (m model) key(k tea.KeyMsg) (tea.Model, tea.Cmd) {
	if k.String() == "ctrl+c" {
		return m, tea.Quit
	}
	if m.state == nil {
		if k.String() == "q" {
			return m, tea.Quit
		}
		return m, nil
	}

	// Typing feedback for a result.
	if m.revising {
		switch k.String() {
		case "esc":
			m.revising = false
			m.feedback.Blur()
			return m, nil
		case "ctrl+s":
			text := strings.TrimSpace(m.feedback.Value())
			id := m.detail
			m.revising = false
			m.feedback.Blur()
			m.feedback.Reset()
			if text == "" {
				return m, nil
			}
			return m, m.act("Sent your feedback; the agent is on it again", func() error { return m.client.Revise(id, text) })
		}
		var cmd tea.Cmd
		m.feedback, cmd = m.feedback.Update(k)
		m.refreshDetail()
		return m, cmd
	}

	// An open task.
	if m.detail != "" {
		t := m.task(m.detail)
		switch k.String() {
		case "esc", "backspace", "q":
			m.detail = ""
			return m, nil
		case "a":
			if t != nil && t.Status == "needs_review" && t.CreatedBy == m.state.Me.ID {
				host := ""
				if t.Result != nil && len(t.Result.Files) > 0 {
					host = m.myOnlineHost()
				}
				id := t.ID
				return m, m.act("Accepted", func() error { return m.client.Accept(id, host) })
			}
			return m, flash("Only results waiting for your review can be accepted")
		case "r":
			if t != nil && (t.Status == "needs_review" || t.Status == "failed") {
				m.revising = true
				cmd := m.feedback.Focus()
				m.refreshDetail()
				return m, cmd
			}
			return m, flash("This task isn't waiting for review")
		case "o":
			if t != nil && t.ParentID != "" {
				m.detail = t.ParentID
			} else if t != nil && len(t.Asks) > 0 {
				m.detail = t.Asks[len(t.Asks)-1].ChildID
			}
			m.refreshDetail()
			return m, nil
		}
		var cmd tea.Cmd
		m.view, cmd = m.view.Update(k)
		return m, cmd
	}

	// The New task form takes keys while a text field has focus.
	if m.tab == tabNew {
		if handled, mm, cmd := m.newTaskKey(k); handled {
			return mm, cmd
		}
	}

	switch k.String() {
	case "q":
		return m, tea.Quit
	case "1", "2", "3", "4", "5", "6":
		m.tab = int(k.String()[0] - '1')
		return m, m.focusForm()
	case "tab", "right", "l":
		m.tab = (m.tab + 1) % len(tabNames)
		return m, m.focusForm()
	case "shift+tab", "left", "h":
		m.tab = (m.tab + len(tabNames) - 1) % len(tabNames)
		return m, m.focusForm()
	case "s":
		if len(m.state.Spaces) > 1 {
			m.space = (m.space + 1) % len(m.state.Spaces)
			m.cursor = [6]int{}
		}
		return m, nil
	case "up", "k":
		if m.cursor[m.tab] > 0 {
			m.cursor[m.tab]--
		}
		return m, nil
	case "down", "j":
		m.cursor[m.tab]++
		m.clampCursor()
		return m, nil
	case "enter":
		if m.tab == tabTasks {
			if ts := m.spaceTasks(); m.cursor[tabTasks] < len(ts) {
				m.detail = ts[m.cursor[tabTasks]].ID
				m.view.GotoTop()
				m.refreshDetail()
			}
		}
		return m, nil
	case "y", "n":
		if m.tab == tabApprovals && m.cursor[tabApprovals] < len(m.state.Approvals) {
			a := m.state.Approvals[m.cursor[tabApprovals]]
			yes := k.String() == "y"
			label := "Denied"
			if yes {
				label = "Approved"
			}
			return m, m.act(label+": "+a.Title, func() error { return m.client.Decide(a.ID, yes) })
		}
		return m, nil
	case "m":
		if m.tab == tabMemory {
			on := !m.state.Memory.On
			label := "Meko memory off: agents get only the task"
			if on {
				label = "Meko memory on"
			}
			return m, m.act(label, func() error { return m.client.ToggleMemory(on) })
		}
		return m, nil
	}
	return m, nil
}

func (m *model) clampCursor() {
	n := 0
	switch m.tab {
	case tabTasks:
		n = len(m.spaceTasks())
	case tabApprovals:
		n = len(m.state.Approvals)
	case tabAgents:
		n = len(m.spaceAgents())
	}
	if m.cursor[m.tab] >= n {
		m.cursor[m.tab] = max(0, n-1)
	}
}

func (m *model) focusForm() tea.Cmd {
	m.instructions.Blur()
	m.check.Blur()
	if m.tab == tabNew {
		m.focus = 0
	}
	return nil
}

func (m model) newTaskKey(k tea.KeyMsg) (bool, tea.Model, tea.Cmd) {
	agents := m.spaceAgents()
	switch k.String() {
	case "ctrl+s":
		sp := m.currentSpace()
		text := strings.TrimSpace(m.instructions.Value())
		if sp == nil || len(agents) == 0 || text == "" {
			return true, m, flash("Pick an agent and write the task first")
		}
		a := agents[min(m.agentCursor, len(agents)-1)]
		kind := "general"
		check := ""
		if sp.Kind == "build" && !m.answerOnly {
			kind, check = "code", strings.TrimSpace(m.check.Value())
		}
		title := strings.SplitN(text, "\n", 2)[0]
		if len(title) > 80 {
			title = title[:80]
		}
		m.instructions.Reset()
		m.tab, m.focus = tabTasks, 0
		m.instructions.Blur()
		m.check.Blur()
		return true, m, m.act("Sent to "+a.Name, func() error {
			_, err := m.client.CreateTask(sp.ID, a.ID, title, text, kind, check)
			return err
		})
	case "tab", "shift+tab":
		step := 1
		if k.String() == "shift+tab" {
			step = 3
		}
		last := 3
		if sp := m.currentSpace(); sp == nil || sp.Kind != "build" || m.answerOnly {
			last = 2
		}
		m.focus = (m.focus + step) % (last + 1)
		m.instructions.Blur()
		m.check.Blur()
		var cmd tea.Cmd
		if m.focus == 2 {
			cmd = m.instructions.Focus()
		} else if m.focus == 3 {
			cmd = m.check.Focus()
		}
		return true, m, cmd
	case "esc":
		if m.focus >= 2 {
			m.focus = 0
			m.instructions.Blur()
			m.check.Blur()
			return true, m, nil
		}
	}
	switch m.focus {
	case 0:
		switch k.String() {
		case "up", "k":
			if m.agentCursor > 0 {
				m.agentCursor--
			}
			return true, m, nil
		case "down", "j":
			if m.agentCursor < len(agents)-1 {
				m.agentCursor++
			}
			return true, m, nil
		case "enter":
			m.focus = 2
			return true, m, m.instructions.Focus()
		}
	case 1:
		switch k.String() {
		case "left", "right", "h", "l", " ", "enter":
			m.answerOnly = !m.answerOnly
			return true, m, nil
		}
	case 2:
		var cmd tea.Cmd
		m.instructions, cmd = m.instructions.Update(k)
		return true, m, cmd
	case 3:
		var cmd tea.Cmd
		m.check, cmd = m.check.Update(k)
		return true, m, cmd
	}
	return false, m, nil
}

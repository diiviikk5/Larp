package main

// The Larp coordinator's HTTP API, as the desktop app and the phone use it.

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Person struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Space struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Kind      string   `json:"kind"`
	MemberIDs []string `json:"memberIds"`
}

type Agent struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	OwnerID  string   `json:"ownerId"`
	HostID   string   `json:"hostId"`
	Runtime  string   `json:"runtime"`
	Model    string   `json:"model"`
	Repo     string   `json:"repo"`
	SpaceIDs []string `json:"spaceIds"`
	Online   bool     `json:"online"`
	Busy     bool     `json:"busy"`
	UsesApps bool     `json:"usesApps"`
}

type Host struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	OwnerID string `json:"ownerId"`
	Online  bool   `json:"online"`
}

type LogLine struct {
	At   string `json:"at"`
	Kind string `json:"kind"`
	Text string `json:"text"`
}

type Check struct {
	Command  string `json:"command"`
	Passed   bool   `json:"passed"`
	ExitCode *int   `json:"exitCode"`
}

type Result struct {
	Summary string   `json:"summary"`
	Files   []string `json:"files"`
	Error   string   `json:"error"`
	Check   *Check   `json:"check"`
}

type Answer struct {
	OK    bool     `json:"ok"`
	Text  string   `json:"text"`
	Files []string `json:"files"`
}

type Ask struct {
	ID       string  `json:"id"`
	To       string  `json:"to"`
	Text     string  `json:"text"`
	ChildID  string  `json:"childId"`
	Answered bool    `json:"answered"`
	Answer   *Answer `json:"answer"`
}

type Recalled struct {
	Text   string `json:"text"`
	Source string `json:"source"`
	From   string `json:"from"`
}

type Context struct {
	Status string     `json:"status"`
	Items  []Recalled `json:"items"`
	Saved  int        `json:"saved"`
}

type Task struct {
	ID          string    `json:"id"`
	SpaceID     string    `json:"spaceId"`
	AgentID     string    `json:"agentId"`
	OwnerID     string    `json:"ownerId"`
	CreatedBy   string    `json:"createdBy"`
	Kind        string    `json:"kind"`
	Title       string    `json:"title"`
	Instructions string   `json:"instructions"`
	Status      string    `json:"status"`
	Log         []LogLine `json:"log"`
	Result      *Result   `json:"result"`
	Asks        []Ask     `json:"asks"`
	ParentID    string    `json:"parentId"`
	AskedBy     string    `json:"askedBy"`
	Context     *Context  `json:"context"`
	UpdatedAt   string    `json:"updatedAt"`
	CreatedAt   string    `json:"createdAt"`
}

type Approval struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	TaskID string `json:"taskId"`
}

type Event struct {
	At    string `json:"at"`
	Type  string `json:"type"`
	Actor string `json:"actor"`
	Text  string `json:"text"`
}

type Royalty struct {
	Saved         int `json:"saved"`
	Reuses        int `json:"reuses"`
	Beneficiaries any `json:"beneficiaries"`
}

type MekoCall struct {
	At      string `json:"at"`
	Tool    string `json:"tool"`
	Kind    string `json:"kind"`
	Agent   string `json:"agent"`
	To      string `json:"to"`
	Summary string `json:"summary"`
	OK      bool   `json:"ok"`
	Ms      int    `json:"ms"`
}

type Memory struct {
	Configured bool               `json:"configured"`
	On         bool               `json:"on"`
	Calls      []MekoCall         `json:"calls"`
	Totals     map[string]float64 `json:"totals"`
	Royalties  map[string]Royalty `json:"royalties"`
}

type Telegram struct {
	Connected bool   `json:"connected"`
	BotName   string `json:"botName"`
	Linked    bool   `json:"linked"`
}

type State struct {
	Me        Person     `json:"me"`
	Spaces    []Space    `json:"spaces"`
	People    []Person   `json:"people"`
	Hosts     []Host     `json:"hosts"`
	Agents    []Agent    `json:"agents"`
	Tasks     []Task     `json:"tasks"`
	Approvals []Approval `json:"approvals"`
	Events    []Event    `json:"events"`
	Memory    Memory     `json:"memory"`
	Telegram  *Telegram  `json:"telegram"`
}

type Client struct {
	URL   string
	Token string
	http  *http.Client
}

func NewClient(url, token string) *Client {
	return &Client{URL: strings.TrimRight(url, "/"), Token: token, http: &http.Client{Timeout: 20 * time.Second}}
}

func (c *Client) do(method, route string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.URL+"/api/"+route, reader)
	if err != nil {
		return err
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		var e struct{ Error string }
		if json.Unmarshal(data, &e) == nil && e.Error != "" {
			return fmt.Errorf("%s", e.Error)
		}
		return fmt.Errorf("%s %s: %s", method, route, res.Status)
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

func (c *Client) State() (*State, error) {
	var s State
	err := c.do("GET", "state", nil, &s)
	return &s, err
}

func (c *Client) CreateTask(spaceID, agentID, title, instructions, kind, check string) (*Task, error) {
	var t Task
	body := map[string]any{"spaceId": spaceID, "agentId": agentID, "title": title, "instructions": instructions, "kind": kind}
	if check != "" {
		body["check"] = check
	}
	err := c.do("POST", "tasks", body, &t)
	return &t, err
}

func (c *Client) Decide(approvalID string, approve bool) error {
	decision := "deny"
	if approve {
		decision = "approve"
	}
	return c.do("POST", "approvals/"+approvalID, map[string]string{"decision": decision}, nil)
}

func (c *Client) Accept(taskID, applyHostID string) error {
	body := map[string]any{}
	if applyHostID != "" {
		body["applyHostId"] = applyHostID
	}
	return c.do("POST", "tasks/"+taskID+"/accept", body, nil)
}

func (c *Client) Revise(taskID, feedback string) error {
	return c.do("POST", "tasks/"+taskID+"/revise", map[string]string{"feedback": feedback}, nil)
}

func (c *Client) ToggleMemory(on bool) error {
	return c.do("POST", "memory/toggle", map[string]bool{"on": on}, nil)
}

// ClaimPairCode turns a pairing code (Settings → Phones → Pair) into a token, the way a phone does.
func ClaimPairCode(url, code string) (string, string, error) {
	c := NewClient(url, "")
	var out struct {
		Token  string `json:"token"`
		Person Person `json:"person"`
	}
	err := c.do("POST", "pair/claim", map[string]string{"code": strings.ToUpper(strings.TrimSpace(code)), "label": "Terminal"}, &out)
	return out.Token, out.Person.Name, err
}

// Stream calls changed() whenever the space changes (the same live stream the app listens to).
func (c *Client) Stream(ctx context.Context, changed func()) {
	for ctx.Err() == nil {
		req, _ := http.NewRequestWithContext(ctx, "GET", c.URL+"/api/stream", nil)
		req.Header.Set("Authorization", "Bearer "+c.Token)
		res, err := (&http.Client{}).Do(req)
		if err == nil && res.StatusCode == 200 {
			scanner := bufio.NewScanner(res.Body)
			for scanner.Scan() {
				if strings.HasPrefix(scanner.Text(), "event: changed") {
					changed()
				}
			}
			res.Body.Close()
		} else if res != nil {
			res.Body.Close()
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

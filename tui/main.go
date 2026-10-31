// larp-tui: Larp in the terminal. Watch tasks live, see agents talk to each other, approve requests,
// accept results, send new tasks and check what Meko remembered, without opening the desktop app.
//
//	larp-tui                         use the Larp desktop app on this computer (its signed-in person)
//	larp-tui pair <address> <code>   pair with a space anywhere, like a phone (Settings → Phones → Pair)
//	larp-tui --url <address> --token <token>
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
)

type saved struct {
	URL   string `json:"url"`
	Token string `json:"token"`
	Name  string `json:"name"`
}

func savedFile() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "larp-tui.json")
}

// desktopSession reads the Larp desktop app's own config on this computer: its space address and the
// token of the person signed in there. LARP_DATA_DIR points at another copy's data, as for the app.
func desktopSession() (saved, error) {
	base := os.Getenv("LARP_DATA_DIR")
	if base == "" {
		dir, err := os.UserConfigDir()
		if err != nil {
			return saved{}, err
		}
		base = filepath.Join(dir, "larp")
	}
	raw, err := os.ReadFile(filepath.Join(base, "larp", "config.json"))
	if err != nil {
		return saved{}, err
	}
	var cfg struct {
		URL            string `json:"url"`
		ActivePersonID string `json:"activePersonId"`
		People         []struct {
			ID, Name, Token string
		} `json:"people"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return saved{}, err
	}
	for _, p := range cfg.People {
		if p.ID == cfg.ActivePersonID || cfg.ActivePersonID == "" {
			return saved{URL: cfg.URL, Token: p.Token, Name: p.Name}, nil
		}
	}
	if len(cfg.People) > 0 {
		return saved{URL: cfg.URL, Token: cfg.People[0].Token, Name: cfg.People[0].Name}, nil
	}
	return saved{}, fmt.Errorf("the desktop app on this computer has no one signed in yet")
}

func main() {
	url := flag.String("url", "", "space address, for example http://192.168.1.20:47821")
	token := flag.String("token", "", "a person's token")
	check := flag.Bool("check", false, "print who this connects as and what it sees, then exit")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "larp-tui: Larp in your terminal.\n\n  larp-tui                         use the Larp desktop app on this computer\n  larp-tui pair <address> <code>   pair with a space (Larp → Settings → Phones → Pair a new phone)\n  larp-tui --url <address> --token <token>")
	}
	flag.Parse()

	if flag.NArg() >= 1 && flag.Arg(0) == "pair" {
		if flag.NArg() != 3 {
			flag.Usage()
			os.Exit(2)
		}
		tok, name, err := ClaimPairCode(flag.Arg(1), flag.Arg(2))
		if err != nil {
			fmt.Fprintln(os.Stderr, "Pairing failed:", err)
			os.Exit(1)
		}
		data, _ := json.MarshalIndent(saved{URL: flag.Arg(1), Token: tok, Name: name}, "", "  ")
		if err := os.WriteFile(savedFile(), data, 0o600); err != nil {
			fmt.Fprintln(os.Stderr, "Couldn't save the pairing:", err)
			os.Exit(1)
		}
		fmt.Printf("Paired as %s. Run larp-tui to start.\n", name)
		return
	}

	session := saved{URL: *url, Token: *token}
	if session.URL == "" || session.Token == "" {
		if raw, err := os.ReadFile(savedFile()); err == nil {
			_ = json.Unmarshal(raw, &session)
		}
	}
	if session.URL == "" || session.Token == "" {
		s, err := desktopSession()
		if err != nil {
			fmt.Fprintln(os.Stderr, "No Larp to connect to:", err)
			fmt.Fprintln(os.Stderr, "Open the Larp desktop app on this computer, or pair: larp-tui pair <address> <code>")
			os.Exit(1)
		}
		session = s
	}

	client := NewClient(session.URL, session.Token)
	state, err := client.State()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't reach the space at %s: %v\n", session.URL, err)
		os.Exit(1)
	}
	if *check {
		fmt.Printf("Connected to %s as %s\n", session.URL, state.Me.Name)
		for _, sp := range state.Spaces {
			fmt.Printf("  space %s (%s)\n", sp.Name, sp.Kind)
		}
		fmt.Printf("  %d agents · %d tasks · %d approvals waiting · Meko configured=%v on=%v\n", len(state.Agents), len(state.Tasks), len(state.Approvals), state.Memory.Configured, state.Memory.On)
		return
	}
	p := tea.NewProgram(newModel(client), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

# Larp apps: Swasthya and Kosh

Two family apps ship with Larp as built-in integrations. Each runs on the owner's own computer and keeps its data there. Larp's desktop app connects to them from the Apps panel, on the owner's computer only.

| App | Kind | Dev UI | API | Repo folder |
|---|---|---|---|---|
| Swasthya | Family health | http://localhost:5190 | http://localhost:5191 | `E:\Swasthya` |
| Kosh | Family finance | http://localhost:5200 | http://localhost:5201 | `E:\Kosh` |

## Connecting

1. `GET /.well-known/larp-integration.json` returns the manifest: name, id, kind, auth and the endpoints with the scope each one needs and what it shares.
2. `GET /api/session` returns `{ token }`. It answers only same-origin or direct requests (`Sec-Fetch-Site` of `same-origin` or `none`), so a web page on another site can't read it. Larp's desktop app reads it from the Electron main process, and only for `localhost` addresses.
3. Every other `/api/*` call needs `Authorization: Bearer <token>`. A wrong or missing token returns 401.
4. `GET /api/health` needs no token: `{ ok, app, members }`.

Errors come back as `{ error }` with the HTTP status. Bodies are JSON and capped in size.

## Swasthya (health)

Data: family members with a health profile, medications and their schedules, doses, vitals, appointments, symptoms, joy notes.

| Method | Path | Scope | What it shares or does |
|---|---|---|---|
| GET | `/api/summary?date=` | health.summary | Today's doses, upcoming appointments and flags for the whole family |
| GET | `/api/doses?date=` | health.doses | Scheduled doses for a day, with status |
| POST | `/api/doses` | health.doses.write | Marks a dose taken or skipped |
| GET | `/api/busy?day=` | calendar.busy | Appointment time windows for a day, without details |
| GET | `/api/appointments` | health.appointments | Appointments with doctor and place |
| GET | `/api/members/{id}/emergency` | health.emergency | Blood group, allergies, conditions, medicines, emergency contact |
| GET | `/api/family` | health.family | Family members and their health profile |

Also available to the app itself: `members`, `medications`, `vitals` (filter by `memberId`, `type`), `symptoms`, `joy` (each with POST, PATCH, DELETE where it makes sense), `POST /api/budh` (the Budh health assistant, needs `GEMINI_API_KEY` in Swasthya's own `.env`) and `POST /api/sample` (loads a sample family).

Larp uses: today's doses (Taken or Skip from the Apps panel), flags, appointments, the emergency card, and "share as Care checklist", which turns the day's doses into a Larp checklist the family can claim from their phones. `calendar.busy` lets a scheduling agent find common free time without seeing what an appointment is.

## Kosh (finance)

Data: members with roles (parents approve), accounts, transactions, monthly budgets per category, recurring bills, savings goals, money requests and an activity feed.

| Method | Path | Scope | What it shares or does |
|---|---|---|---|
| GET | `/api/summary` | finance.summary | This month's income, spending, bills due, goals and pending requests |
| GET | `/api/bills?month=` | finance.bills | Recurring bills with due dates and who pays them |
| POST | `/api/bills/{id}/pay` | finance.bills.write | Marks a bill paid and records the payment |
| GET | `/api/month?month=` | finance.budgets | Spending by category against the family's budgets |
| GET | `/api/goals` | finance.goals | Savings goals and how far along they are |
| POST | `/api/requests` | finance.requests.write | Asks the family for money (a parent approves) |
| GET | `/api/activity?limit=` | finance.activity | The family money feed |

Also available to the app itself: `family`, `meta` (categories, roles, account kinds), `members`, `accounts`, `transactions`, `budgets`, `bills` (POST, PATCH, DELETE, `POST /api/bills/{id}/claim`), `goals` (`POST /api/goals/{id}/add`), `POST /api/requests/{id}/decide` (a parent approves or declines), `POST /api/sample` (loads the sample Sharma family).

Larp uses: the month's stats, requests to approve, bills to pay, goals, the feed, and an "act as" picker so each family member acts as themselves.

## Rules for agents

- Agents don't call the apps themselves. They find this contract through Meko, so they can plan around it and propose actions; a person carries them out from the Apps panel. Write endpoints (`*.write`) change family data.
- Health and money details never go into Meko. Only the task text and the agent's result do.
- The apps answer on `localhost`. A friend's Larp on another computer can't reach your apps; they connect their own copies.

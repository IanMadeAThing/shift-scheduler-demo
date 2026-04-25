# Building a Church Volunteer Management System from Scratch
### A Developer's Journal — October 2025 to April 2026

---

## Overview

What started as a simple hackathon prototype has grown into a full-stack volunteer management platform built specifically for church operations. This journal documents the complete development process — the decisions made, the problems solved, and the lessons learned along the way.

**Live app:** https://ianmadeathing.github.io/shift-scheduler-demo
**Stack:** Vanilla JavaScript · Google Apps Script · Google Sheets · GitHub Pages

---

## October 2025 — The MVP

The project started at a **FaithTech event** — a hackathon focused on building tools for faith communities. The goal was simple: give pastors a way to manage volunteer schedules without relying on group texts and spreadsheets.

The first version was a single HTML file with inline styles, hardcoded users, and `localStorage` as the database. It had a basic schedule table, a mood survey with three options, and a simulate week button. It worked well enough to prove the concept.

**What the MVP had:**
- Current Schedule table with cancel/undo actions
- Basic mood submission (1/2/3 scoring)
- Mood trend display per user
- Admin notifications panel
- Simulate Week and Reset App buttons
- All data stored in `localStorage`

**The core problem with localStorage:** Data only existed on one device and disappeared on reset. For a real team tool, this was a non-starter.

---

## January 2026 — Rethinking the Architecture

After the FaithTech event, it became clear that the app needed a real backend. The question was which one made sense for a small church with no IT budget.

After evaluating several options, the decision was made to use **Google Apps Script as a serverless backend with Google Sheets as the database.** Here's why this won:

- **Zero cost.** Google's free tier covers the entire use case.
- **No server to maintain.** Apps Script runs on Google's infrastructure.
- **Pastors can open the database** like a normal spreadsheet. No technical knowledge required.
- **Native integrations** with Gmail and Google Calendar — tools the church already uses.

The architecture settled on:

```
Browser (GitHub Pages)
    ↕  HTTP (fetch API)
Google Apps Script (Web App)
    ↕  SpreadsheetApp / GmailApp / CalendarApp
Google Sheets · Gmail · Google Calendar
```

### The SMS Problem

The biggest unsolved problem at this point was how to send text messages to volunteers. Every SMS API (Twilio, Vonage, MessageBird, Textbee) either required:

- An Android phone as a gateway
- Business verification that kept locking the account
- Credit card information and paid plans

After weeks of hitting walls with every service, a different approach was discovered: **carrier email-to-SMS gateways.**

Every major US carrier exposes a hidden email address that forwards to SMS:

```
5551234567@tmomail.net     → T-Mobile
5551234567@txt.att.net     → AT&T
5551234567@vtext.com       → Verizon
```

By sending an email through Gmail to `{phonenumber}@{carrierdomain}`, the message arrives as a real SMS on the volunteer's phone. **Free. No API. No signup. No Android phone required.**

This was the breakthrough the project needed.

---

## February–March 2026 — Building the Real System

With the architecture decided, development began on the three core files:

### `Code.gs` — The Backend

The Apps Script backend was designed around a clean separation of concerns from the start. Every function has one job. Private helpers use an underscore prefix. All configuration lives in a single `CONFIG` object at the top of the file.

**The four sheet tabs created by `setup()`:**
- `Volunteers` — stores all volunteer records
- `Assignments` — tracks service assignments
- `Mood Log` — records post-service feedback scores
- `Alerts` — logs mercy team and 1-on-1 flags

**The three automated SMS flows:**

1. **Onboarding** — Pastor adds a volunteer → SMS fires with a Google Form link → volunteer fills out their availability and ministry interests → form response auto-populates the Volunteers sheet
2. **Schedule** — Pastor assigns a volunteer to a service → SMS fires with date, time, and role → Google Calendar invite sent to their email
3. **Feedback** — Service ends → Pastor clicks Send Feedback → SMS fires with a post-service survey link → response logged to Mood Log sheet

**The alert logic** was the most interesting engineering challenge. The system needed to detect patterns across multiple submissions, not just react to a single score:

```
2 bad scores in a row   → Mercy Team referral
1 bad score             → Pastor 1-on-1
3 neutral scores in row → Pastor 1-on-1 (re-engagement)
All submissions         → Pastor notified regardless
```

This was implemented using `Array.slice(-3)` and `Array.every()` to check a sliding window of the last three submissions.

**The Web App API** uses a dispatch table pattern for routing instead of if/else chains:

```javascript
const handlers = {
  getVolunteers:  () => ({ volunteers:  _getRows(SHEETS.VOLUNTEERS)  }),
  getAssignments: () => ({ assignments: _getRows(SHEETS.ASSIGNMENTS) }),
  getMoodLog:     () => ({ moodLog:     _getRows(SHEETS.MOOD)        }),
  getAlerts:      () => ({ alerts:      _getRows(SHEETS.ALERTS)      }),
};
```

Adding a new endpoint is a single line. The entire `doPost` function is wrapped in a top-level try/catch so any error anywhere in the call chain returns clean JSON instead of an unhandled exception.

### `app.js` — The Frontend Brain

The frontend was built around a single architectural principle: **centralized state as the single source of truth.**

```javascript
const state = {
  volunteers:  [],
  assignments: [],
  moodLog:     [],
  alerts:      [],
  loading:     false,
  error:       null,
};
```

All data lives here. Render functions only read from state. Action functions write to state then call `renderAll()`. This makes bugs easy to find — if something looks wrong on screen, you check state first.

**Key architectural decisions:**

- `Promise.all()` for parallel data loading — all four API requests fire simultaneously instead of sequentially, making initial load ~4x faster
- `try/catch` on every async operation — the app never crashes silently
- `_escape()` on all user data before inserting into `innerHTML` — XSS prevention
- Optimistic updates on non-critical operations like resolving alerts

### `index.html` + `style.css` — The UI

The initial UI was built in three phases, each one deliberately before any JavaScript was written. The goal was to separate concerns completely:

**Phase 1 — Skeleton:** Raw HTML structure with no styling. Every element gets its `id` and `class` before a single line of CSS is written.

**Phase 2 — CSS design system:** Reset, variables, layout, cards, tables, badges, buttons — all defined as reusable classes. The card pattern (`class="card"`) is defined once and used everywhere. Changing the card style means changing one CSS rule, not hunting through the file.

**Phase 3 — Tabs:** The tab system uses a single trick:
```css
.tab        { display: none; }
.tab.active { display: block; }
```
All panels exist in the DOM simultaneously. JavaScript swaps the `active` class on click. No frameworks needed.

---

## April 2026 — Deployment, Debugging, and the UI Overhaul

### Transferring Ownership

The project started in a temporary GitHub account used during the hackathon. In April, the repo was transferred to the main account at `IanMadeAThing/shift-scheduler-demo` and GitHub Pages was re-enabled.

**Lesson learned:** Git never forgets. The full commit history transferred with the repo, showing the complete progression from MVP to finished product. This is exactly what you want for a portfolio project.

### The CORS Bug

The most frustrating debugging session of the project turned out to have the simplest explanation.

The app worked perfectly when the API URL was pasted directly into the browser. But the app kept showing a connection error. Two hours of investigating the Apps Script deployment, redeployments, and permission settings later — the issue was identified.

The `SHEET_API_URL` in `app.js` still contained the placeholder text:
```javascript
const SHEET_API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
```

One line. That was it.

**Lesson learned:** Always grep for placeholder strings before deploying.

### The UI Overhaul

With the backend functional, attention turned to the front end. The original UI, while functional, read as a prototype. Three concept mockups were generated before writing any code:

- **Concept A** — Minimal stat cards with a personal greeting
- **Concept B** — Dark icon sidebar, enterprise-style
- **Concept C** — Top nav with purple hero banner (chosen)

Concept C was selected for its alignment with the church color scheme and its clarity for non-technical users. The key changes:

**Hero banner** — replaces the four colored stat cards with a single purple gradient banner showing the total volunteer count, with three smaller mini-stat cards below for assignments, feedback, and alerts.

**White sidebar (desktop)** — replaces the top nav on desktop. The sidebar collapses to icon-only on tablets (769–1024px).

**Mobile single-page scroll** — on screens under 768px, the sidebar hides completely and all tabs stack vertically. No tab switching on mobile — just scroll. This matches the UX pattern of native mobile apps.

**Error toast** — the full-width red error banner was replaced with a small floating card at the bottom of the screen with an info icon, dismiss button, and slide-up animation. Much less alarming, much more professional.

**Volunteer cards** — plain table rows replaced with avatar cards. Each volunteer gets an initials avatar generated from their name, with action buttons inline.

**Shift cards** — assignment rows replaced with left-bordered cards showing volunteer name, role, date and time at a glance.

---

## Current State — April 25, 2026

**What's fully working:**
- ✅ Dashboard with hero banner and live stats
- ✅ Volunteer management with SMS onboarding
- ✅ Service assignments with SMS + Google Calendar
- ✅ Post-service feedback collection
- ✅ Mercy team alert logic
- ✅ Pastor email notifications on all feedback
- ✅ White sidebar on desktop, mobile scroll on phone
- ✅ Error handling throughout with user-friendly messages
- ✅ Deployed at ianmadeathing.github.io/shift-scheduler-demo

**What's in progress:**
- 🔄 SMS testing with real team members on active smartphones
- 🔄 Form trigger automation (currently manual via Apps Script UI)
- 🔄 Volunteer landing page for public-facing onboarding link

**What's next:**
- Mobile error toast (collapsed ! icon that expands on tap)
- Volunteer landing page as a separate GitHub Pages repo
- SMS confirmation testing across carriers

---

## Reflections

The most valuable decision made in this project was choosing Google Apps Script over a traditional Node.js backend. It eliminated the need for a hosted server, removed the entire DevOps overhead, and kept the cost at zero — which matters enormously for a small church with no IT budget.

The SMS gateway approach is the kind of solution that only emerges after exhausting every conventional option. Sometimes the best architecture isn't the one in the tutorial.

The hardest part wasn't the code. It was the months of momentum lost to SMS services that wouldn't let you sign up, APIs that locked accounts on first use, and platforms that required business verification for a church volunteer app. Persistence through that friction is what got this to a working product.

---

*Built with vanilla JavaScript, Google Apps Script, Google Sheets, and GitHub Pages.*
*No frameworks. No paid APIs. No monthly bills.*
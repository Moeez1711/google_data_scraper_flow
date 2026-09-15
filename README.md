# Lead Scout

**A personal lead-generation engine for local businesses.** It finds businesses on Google Maps, checks their websites, works out how to reach them (WhatsApp first for Oman), scores every lead with the reasons behind the score, and tracks your outreach until the lead converts.

It replaces the manual routine of searching Google Maps, opening every website and copying contacts into a spreadsheet.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [Google Cloud setup](#google-cloud-setup)
6. [Using the app](#using-the-app)
7. [How a scan works](#how-a-scan-works)
8. [Lead scoring](#lead-scoring)
9. [Website analysis](#website-analysis)
10. [Outreach workflow](#outreach-workflow)
11. [Usage limits & cost control](#usage-limits--cost-control)
12. [Sign-in](#sign-in)
13. [Data, backups & starting fresh](#data-backups--starting-fresh)
14. [Exports](#exports)
15. [API reference](#api-reference)
16. [Project structure](#project-structure)
17. [Extending](#extending)
18. [Scripts](#scripts)
19. [Troubleshooting](#troubleshooting)
20. [Known gaps](#known-gaps)

---

## Features

| Area | What you get |
|---|---|
| **Discovery** | Search any city, area or neighbourhood in any country. Pick from **238 built-in business categories** in 12 groups, or type your own. |
| **Coverage** | Adaptive tiling gets past Google's 60-results-per-search limit, so dense areas are covered completely. |
| **Live scanning** | Watch progress, logs and new leads arrive in real time. Pause, resume or stop a scan, and it survives crashes. |
| **Website checks** | Detects no website, social-only pages, broken sites, outdated markup, missing HTTPS, missing mobile viewport, slow responses, and missing calls-to-action or booking. |
| **Contacts** | Phone numbers (E.164), WhatsApp (verified only when the site links to it), emails, Instagram and Facebook. |
| **Scoring** | A 0–100 score with a 🔥 Hot / 🟡 Potential / ⚪ Low tier, and a reason for every point. |
| **Lead management** | Filters by country, searched category, tier, web presence, rating, reviews, status, contact route and follow-up. Also bulk actions, notes, statuses and follow-up reminders. |
| **Outreach** | Personalised WhatsApp messages chosen from each lead's real web-presence problem. |
| **Analytics** | Pipeline, tier, web-presence and category breakdowns (click any bar to open those leads), plus API usage. |
| **Export** | CSV or Excel, for either the selected leads or everything that matches your filters. |
| **Cost control** | A per-scan request budget, monthly and daily caps, a response cache, and cost estimates. |

## Tech stack

- **Server:** Node.js 22.13+, Express 5, built-in `node:sqlite` (nothing native to compile), Cheerio, libphonenumber-js, ExcelJS
- **Client:** React 19, Vite 7, Tailwind CSS v4 (`@tailwindcss/vite`)
- **Google APIs:** Places API (New) Text Search on the server, and the Maps JavaScript API in the browser
- **Live updates:** Server-Sent Events

---

## Quick start

**Prerequisites:** Node.js **22.13 or newer** (`node -v`) and a Google Cloud project with billing enabled.

```bash
# 1. Install server and client dependencies (once)
npm run setup

# 2. Create your environment file and add your keys
cp .env.example .env

# 3. Start the API and the UI together
npm run dev
```

Then open **http://localhost:5173**. The API runs on http://127.0.0.1:4000.

**Production-style run** (one process, serves the built UI):

```bash
npm run build && npm start     # then open http://127.0.0.1:4000
```

To stop the app, press `Ctrl+C` in the terminal that is running it. Running scans are marked *interrupted*, and you can resume them later.

---

## Configuration

All settings live in `.env` in the project root. This file is git-ignored, so never commit it.

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | — **(required)** | Server only | Places API (New) key. It is never sent to the browser. |
| `PORT` | `4000` | Server | API port. The server always binds to `127.0.0.1`. |
| `PLACES_RPS` | `5` | Server | Requests per second sent to the Places API. |
| `PLACES_COST_PER_1000` | `35` | Server | USD per 1,000 searches, used for cost estimates. You can override it in Settings. |
| `PLACES_CACHE_TTL_HOURS` | `72` | Server | Default time to reuse identical search responses. You can override it in Settings. |
| `WEBSITE_CONCURRENCY` | `4` | Server | Number of website analyses run in parallel. |
| `DB_PATH` | `data/leads.db` | Server | SQLite database location. |
| `VITE_GOOGLE_MAPS_JS_KEY` | — | Browser | Maps JavaScript API key, used for map display. |
| `VITE_GOOGLE_MAP_ID` | `DEMO_MAP_ID` | Browser | Map ID for Advanced Markers. |

> Vite reads `VITE_*` values only at startup, so restart `npm run dev` after changing them.

## Google Cloud setup

1. In Google Cloud Console, enable **Places API (New)** and **Maps JavaScript API**.
2. Create **two separate keys** and restrict each one:

| Key | API restriction | Application restriction |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Places API (New) | None or IP. It is used only from your machine's server. |
| `VITE_GOOGLE_MAPS_JS_KEY` | Maps JavaScript API | HTTP referrers `http://localhost:5173/*` and `http://127.0.0.1:4000/*` |

The browser key is visible to anyone who opens the page, which is why the referrer restriction matters. The Places key never leaves the server.

---

## Using the app

The sidebar follows the workflow from top to bottom.

| Page | What it's for |
|---|---|
| **01 · Search Configuration** | Choose a country, area and category, then optional keywords, a lead target, and an API budget. **Preview area** shows the scan rectangle on the map, and you can drag or resize it before starting. **Reuse a previous search** refills the form from an earlier scan. |
| **02 · Live Scanner** | Shows the running scan's progress, tiles, the log, API calls and new leads. Pause, resume or stop from here, and browse past scans. |
| **03 · Lead Results** | Country tabs and **Searched for** tabs list every category you have scanned, including ones with 0 leads under the current filters. Below them are the top four "contact first" cards, filters, a sortable table and bulk actions. Click a row to open **Lead Details**. |
| **Lead Details** (drawer) | Score reasons, website findings, contacts, a WhatsApp message, status, notes and follow-up date. Use ↑/↓ (or K/J) to move through the current list. |
| **04 · Analytics** | Pipeline and quality breakdowns, plus API usage and cost. Click any bar to open those leads. |
| **05 · Export** | Download CSV or Excel for your current filters. |
| **06 · Outreach** | Edit the message templates, your name and company, and the auto-mark-contacted setting. |
| **07 · Settings** | Usage limits, the default scan budget and target, the search-reuse window, and cost-estimate inputs. |

### Business categories

The category field has two ways to choose:

- **Type:** the field suggests matching categories as you type, with each one's group and value tier.
- **Browse all categories…:** a dropdown that lists all 238 categories under 12 groups: Health & medical, Beauty & wellness, Food & drink, Shopping & retail, Automotive, Real estate & construction, Hotels & travel, Professional & business services, Education & childcare, Sports & leisure, Pets, and Community.

A built-in category uses a tuned Google query and a value tier (high, medium or low), which feeds the score. Anything you type yourself is searched exactly as written and scored as medium value.

### Lead statuses

`Not contacted` → `Contacted` → `Interested` → `Converted`, or `Not interested`.

---

## How a scan works

1. **Resolve the area.** Text Search turns "area, country" into a viewport. If Google returns only a point, the app scans a radius around it; you set the radius in the form.
2. **Split into tiles.** A single Text Search returns at most 60 results. When a tile reaches the third results page it is *saturated*: it is split into 4 sub-tiles and searched again. Splitting stops at about **350 m** or **9 levels** deep.
3. **One request per page.** Each request already returns the name, address, location, types, phone numbers, website, rating, review count, business status, opening hours and Maps link. No separate Place Details calls are made.
4. **Deduplicate.** Businesses are matched by Place ID, then by E.164 phone plus normalised name, then by website domain plus name. A business found by several scans is stored once and linked to each scan.
5. **Analyse websites.** A background queue (`WEBSITE_CONCURRENCY`) fetches each homepage and one contact page. Results are reused across branches that share a domain.
6. **Score.** Every lead is rescored as new information arrives.

A scan ends when it reaches its lead target, uses up its request budget, runs out of tiles, or hits a usage cap (a cap pauses the scan so you can resume it).

### Reliability

- **Resumable:** all state (scans, tiles, leads) lives in SQLite. Pause, stop, resume and crash recovery all continue from the pending tiles.
- **Rate limits and errors:** requests are throttled to `PLACES_RPS`. 429 and 5xx responses are retried with backoff. A 401/403 stops the scan with a clear error.
- **Caching:** identical Places requests are served from cache during the reuse window and are not billed again.

---

## Lead scoring

The score is the sum of the rules below, clamped to **0–100**. **🔥 Hot ≥ 65 · 🟡 Potential ≥ 40 · ⚪ Low < 40.** Every rule that fires is shown as a reason. The rules are defined in `server/scoring.js`.

| Signal | Rule | Points |
|---|---|---|
| **Web presence** | No website on Google listing | +30 |
| | Broken website | +28 |
| | Only a social or marketplace page | +26 |
| | Website looks outdated / dated (markup signals) | +20 / +10 |
| | No mobile viewport | +8 |
| | No HTTPS | +5 |
| | Slow HTML response | +4 |
| | No clear call, WhatsApp link or contact form on the homepage | +4 |
| | No online booking or ordering, for bookable business types | +3 |
| **Reputation** | Rating ≥ 4.5 / ≥ 4.0 / ≥ 3.5 | +12 / +8 / +3 |
| | Reviews ≥ 200 / ≥ 50 / ≥ 15 | +14 / +10 / +5 |
| | Rating ≥ 4.2, ≥ 30 reviews, **and** weak web presence | +8 |
| **Reachability** | WhatsApp link published on the website | +12 (+14 in WhatsApp-first countries) |
| | Mobile number, likely WhatsApp but unverified | +7 (+12 in WhatsApp-first countries) |
| | Landline only | +5 |
| | No phone number | −10 |
| | Email found | +3 |
| **Business** | Operational | +5 |
| | Temporarily closed | −15 |
| | High-value / mid-value category | +8 / +4 |

Permanently closed businesses are hidden from lists unless explicitly requested.

---

## Website analysis

The checks are server-side HTML fetches with a 12-second timeout and a 2 MB limit. They are **heuristics**, and the UI labels them that way.

| Measured | Method |
|---|---|
| Reachable / broken | HTTP fetch, DNS/TLS errors, timeouts and parked pages. HTTP 401/403/429 is shown as *blocked automated check*, **not** as broken. |
| HTTPS | Final URL scheme, plus a probe of the `https://` version |
| Mobile | `<meta name="viewport" content="width=device-width">` in the markup |
| Speed | Server-side HTML fetch time and page size |
| Modern vs outdated | Markup signals: deprecated tags, Flash, table layouts, old jQuery or WordPress, stale © year, lazy or responsive images, frameworks |
| CTA / booking | `tel:`, `mailto:` and WhatsApp links, contact forms, and booking or ordering providers and phrases |
| Email / WhatsApp / socials | Links and text on the homepage and one contact page |

**Not measured** (the UI says "not measured"): real rendered mobile layout, visual design quality, and Core Web Vitals / Lighthouse.

**WhatsApp honesty rule:** a number is marked **verified** only when the business publishes a `wa.me` or `api.whatsapp.com` link. A plain mobile number is shown as "likely WhatsApp (unverified)". Confirming that a number is actually on WhatsApp would require WhatsApp's own APIs.

---

## Outreach workflow

- **Personalised messages.** Each lead gets a message template picked from its situation: *No website*, *Social page only*, *Broken site*, *Outdated site* or *General*. Templates can use `{name}`, `{category}`, `{rating}`, `{reviews}`, `{website}`, `{platform}`, `{compliment}` and `{signoff}`.
- **WhatsApp with message.** This opens WhatsApp with the text already filled in. Nothing is sent until you press send.
- **Contact tracking.** Opening WhatsApp, a call or an email from the app marks the lead *Contacted* and records the time. You can turn this off on 06 · Outreach.
- **Follow-ups.** Set a date per lead: Tomorrow, +3 days, +1 week or a custom date. Due follow-ups appear as a banner, a sidebar badge and a filter, and both dates are included in exports.

---

## Usage limits & cost control

Every billed Text Search counts toward your caps. Cached responses are free. The server checks the caps **before** each billed search.

| Setting (07 · Settings) | Default |
|---|---|
| Monthly search limit | 1,000 (Google's free monthly Text Search Enterprise allowance) |
| Daily search limit | 0 = no daily limit |
| Default scan budget | 150 requests |
| Default lead target | 100 |
| Search-reuse window | `PLACES_CACHE_TTL_HOURS` (72 h) |
| Free searches per month / cost per 1,000 | 1,000 / `PLACES_COST_PER_1000` |

- **When a cap is hit:** the running scan pauses with a message. You can resume it after raising the cap or once the day or month rolls over.
- **While you are at a cap:** starting or resuming a scan is blocked.
- **Scan budget:** each scan's request budget is a hard cap.

---

## Sign-in

The server includes optional single-user sign-in:
- **Passwords:** stored as salted scrypt hashes in the `settings` table.
- **Sessions:** HttpOnly cookies that last 1 day, or 30 days with "remember me".
- **Lockout:** 5 failed attempts lock sign-in for 15 minutes.

While no login is set, the dashboard is open. That is normal for a tool that only listens on `127.0.0.1`.

> **Current state:** the client has no sign-in or Privacy screen, so sign-in can't be switched on from the app. See [Known gaps](#known-gaps). If a login was set previously and you are locked out, stop the app and run `npm run reset-login`.

---

## Data, backups & starting fresh

Everything is stored in one SQLite database, `data/leads.db` (plus its `-wal` and `-shm` files). The database is git-ignored.

| Table | Contents |
|---|---|
| `businesses` | One row per lead: contacts, website findings, score, status, notes, follow-ups |
| `scans` / `tiles` / `scan_businesses` | Scan configuration, tile progress, and which scan found which lead |
| `api_calls` | Every Google request. **This drives usage limits and cost figures.** |
| `api_cache` | Cached Places responses |
| `settings` / `sessions` | App settings, limits, outreach templates, sign-in |

**Back up** (safe while the app is running):

```bash
mkdir -p data/backups
sqlite3 data/leads.db ".backup data/backups/leads-$(date +%Y%m%d-%H%M).db"
```

**Start fresh but keep settings and usage history.** This clears leads, scans and the cache:

```bash
sqlite3 data/leads.db "PRAGMA foreign_keys=ON; BEGIN;
  DELETE FROM scan_businesses; DELETE FROM tiles; DELETE FROM businesses;
  DELETE FROM scans; DELETE FROM api_cache;
  UPDATE api_calls SET scan_id = NULL; COMMIT;"
```

Keep `api_calls`. Deleting it resets the "searches used" counters, even though Google still counts those searches for billing. Don't reset `sqlite_sequence` either: new scans would reuse old scan ids.

**Full reset, everything included:** stop the app, move `data/leads.db*` into `data/backups/`, and start again. The schema is recreated automatically.

---

## Exports

CSV and Excel exports hold up to 5,000 leads, with these columns:

Tier · Score · Business · Category · Phone · WhatsApp · WhatsApp source · Emails · Website · Website status · Design (heuristic) · Mobile (heuristic) · HTTPS · Rating · Reviews · Business status · Address · Google Maps · Instagram · Facebook · Lead status · Notes · Follow-up · Last contacted · Why this score · Place ID

---

## API reference

All endpoints live under `/api` on `127.0.0.1:4000`, return JSON, and go through the sign-in check.

**App & settings**

| Method | Path | Description |
|---|---|---|
| GET | `/meta` | Countries, categories, tiers, WhatsApp-first countries, key status |
| GET / PUT | `/settings` | Outreach and app settings |
| GET / PUT | `/limits` | Usage caps and current usage |
| GET | `/followups` | Counts of due and upcoming follow-ups |
| GET | `/events` | Server-Sent Events: `scan:status`, `scan:progress`, `scan:log`, `lead:updated`, `api` |

**Scans**

| Method | Path | Description |
|---|---|---|
| POST | `/area/resolve` | Preview an area and get its bounds |
| GET / POST | `/scans` | List scans / start a scan |
| GET / DELETE | `/scans/:id` | Scan details / delete a scan |
| POST | `/scans/:id/pause` · `/resume` · `/stop` | Control a scan |

**Leads**

| Method | Path | Description |
|---|---|---|
| GET | `/leads` | Filtered, sorted, paged leads |
| GET | `/leads/map` | Map points for the current filters |
| GET | `/leads/categories` · `/countries` · `/search-categories` | Counts that drive the filter tabs |
| GET / PATCH | `/leads/:placeId` | Lead details / update status, notes, follow-up |
| POST | `/leads/:placeId/reanalyze` | Re-queue the website check |
| GET | `/analytics?scanId=` | Dashboard figures |
| POST | `/export` | `{ format: 'csv' \| 'xlsx', ids? , filters? }` |

**`/leads` query parameters:**
- **Scope and search:** `scanId`, `q`
- **Filters:** `tier`, `leadStatus`, `category`, `country` (comma-separated lists), `searchCategory`, `minRating`, `minReviews`, `minScore`, `includeClosed`, `ids`
- **`web`:** `none`, `social_only`, `broken`, `outdated`, `not_mobile`, `no_https`, `modern`, `pending`
- **`contact`:** `whatsapp`, `phone`, `email`
- **`followUp`:** `due`, `scheduled`
- **Sort and paging:** `sort`, `dir`, `limit` (max 5000), `offset`

**Sign-in:** `GET /auth/status` · `POST /auth/setup` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-others` · `PUT /auth/credentials` · `POST /auth/disable`

---

## Project structure

```
google_data_scraper_flow/
├── .env.example            template for .env (keys and tuning)
├── package.json            root scripts; server dependencies
├── data/                   git-ignored
│   ├── leads.db            SQLite database
│   └── backups/            manual backups
├── server/
│   ├── index.js            Express app on 127.0.0.1; serves client/dist in production
│   ├── config.js           .env loading and defaults
│   ├── routes/api.js       REST endpoints and SSE stream
│   ├── auth.js             optional sign-in, sessions, lockout
│   ├── reset-login.js      CLI: remove the sign-in
│   ├── scanner/engine.js   scan lifecycle, adaptive tiles, pause/resume/stop
│   ├── providers/
│   │   ├── index.js        lead-source registry
│   │   └── googlePlaces.js Places API (New): throttling, retries, cache
│   ├── enrich/
│   │   ├── websiteAnalyzer.js  website fetch and markup checks
│   │   ├── contacts.js     email / WhatsApp / social extraction
│   │   └── siteQueue.js    background analysis queue
│   ├── scoring.js          score, tier and reasons
│   ├── catalog.js          countries, 238 categories, WhatsApp-first countries
│   ├── limits.js           usage caps and cost estimates
│   ├── repo.js             queries, deduplication, filters, analytics
│   ├── db.js               schema and migrations
│   ├── export.js           CSV / Excel
│   ├── events.js           in-process event bus
│   └── util.js             shared helpers
└── client/
    ├── vite.config.js
    └── src/
        ├── main.jsx, App.jsx   app shell, navigation, live event stream
        ├── styles.css          Tailwind v4 and design tokens (@theme)
        ├── lib/
        │   ├── api.js          fetch helpers, filters, lead statuses
        │   ├── outreach.js     templates, WhatsApp links, follow-up dates
        │   └── maps.js         Maps JavaScript API loader
        └── components/
            ├── SearchConfig.jsx      01 · Search Configuration
            ├── LiveScanner.jsx       02 · Live Scanner
            ├── LeadResults.jsx       03 · Lead Results
            ├── Analytics.jsx         04 · Analytics
            ├── ExportPanel.jsx       05 · Export
            ├── OutreachSettings.jsx  06 · Outreach
            ├── SettingsPage.jsx      07 · Settings
            ├── LeadDrawer.jsx        Lead Details drawer
            ├── MapView.jsx           map with editable scan rectangle
            └── ui.jsx                shared UI pieces
```

**Styling:** Tailwind CSS v4. Design tokens are defined in `@theme` in `client/src/styles.css`, so utilities such as `bg-panel`, `text-muted` and `bg-hot` work in any new markup.

---

## Extending

| To change… | Edit |
|---|---|
| Categories, their Google query or value tier | `GROUPS` in `server/catalog.js`. Keep existing `id`s and labels stable, because saved scans refer to them. |
| WhatsApp-first countries | `WHATSAPP_FIRST` in `server/catalog.js` |
| Scoring weights and tier thresholds | `server/scoring.js` |
| Message templates (defaults) | `client/src/lib/outreach.js` |
| Add a data source (e.g. OSM, Yelp, CSV import) | Implement `resolveArea` and `searchArea` like `server/providers/googlePlaces.js`, then register it in `server/providers/index.js` |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Install server and client dependencies |
| `npm run dev` | API (auto-restarts on change) and Vite UI together |
| `npm run dev:server` / `npm run dev:client` | Run only one side |
| `npm run build` | Build the client into `client/dist` |
| `npm start` | Production mode: one server on :4000 that also serves the built UI |
| `npm run reset-login` | Remove the sign-in (run it with the app stopped) |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 5173 is in use, trying another one…` | The app is already running. Use the existing copy at http://localhost:5173, or stop it with `lsof -ti :4000,:5173 \| xargs kill` and start again. Don't use the fallback port (5174): your Maps key's referrer restriction will block the map there. |
| Map is blank or shows "For development purposes only" | Check `VITE_GOOGLE_MAPS_JS_KEY`, that the Maps JavaScript API is enabled, and the referrer restrictions. Restart `npm run dev` after editing `.env`. |
| "GOOGLE_PLACES_API_KEY is missing on the server" | Add the key to `.env` and restart. |
| Scan stops with a 401/403 error | The Places key is wrong or restricted to the wrong API, Places API (New) isn't enabled, or billing is off. |
| Scan paused at a limit | Raise the cap on 07 · Settings, or wait for the day or month to roll over, then resume. |
| Website shows "blocked automated check" | The site refused the server's request (HTTP 401/403/429). Open it yourself to check. |
| `node:sqlite` or `DatabaseSync` error on start | Upgrade Node to 22.13 or newer. |
| Locked out of sign-in | Stop the app and run `npm run reset-login`. |

---

## Known gaps

- **No sign-in screen in the client.** The sign-in API exists on the server, but there is no screen to set it up or log in.
- **Website checks are markup heuristics.** They don't render pages, so real mobile layout, design quality and Core Web Vitals are not measured.
- **WhatsApp availability can't be confirmed** without WhatsApp's own APIs. Only published `wa.me` links count as verified.

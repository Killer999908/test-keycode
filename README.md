# KEYCODE Studio

Full-stack site + API for [keycode.studio](https://keycode.studio) — an AI platform for building websites, games, PCBs, and CAD projects from a single prompt, in the browser or from your terminal.

## Badges

[![CLI installers E2E](https://github.com/Killer999908/test-keycode/workflows/CLI%20installers%20E2E/badge.svg?branch=refs%2Fheads%2Fgh-pages)](https://github.com/Killer999908/test-keycode/actions/workflows/CLI%20installers%20E2E?query=branch%3Agh-pages)

> Green = installer E2E passed on ubuntu + macOS (install → signup → API key → CLI login → agent build),
> Windows PowerShell installer validated, full Jest suite and the signup→key→CLI system test all green.

## What's in the repo

- `server.js` + `routes/` — Express API: auth (password/OTP/magic link/passkey/OAuth), payments, orders, coupons, agent, notifications, social, admin
- `lib/` — AI provider chain, agent core & tools, mailer, mock data store
- `keycode-cli.js` — the `keycode` agent CLI (login, agent build, list, setup)
- `install.sh` / `install.ps1` — one-line installers for Linux/macOS/Termux and Windows (binary download + URL injection via dynamic endpoints)
- `test/` — Jest + Supertest suites (70+ coverage, including system tests of the full signup → key → CLI flow)
- `*.html` — the site + dashboards (static, served by Express)

## CI

GitHub Actions (`.github/workflows/cli-installer-e2e.yml`) runs on every push:

| Job | What it proves |
|---|---|
| `install.sh on ubuntu-latest / macos-latest` | curl-pipes the served installer in a sandboxed HOME, then drives the real CLI: signup → mint API key → `keycode login` → `keycode agent` build |
| `install.ps1 on windows` | PowerShell parser validation, server start, served-payload injection check |
| `jest test suite` | all 70+ tests |
| `system test — signup → key → CLI` | the full signup → API key → CLI login flow against a live in-process server |

### Branch protection on `gh-pages`

`gh-pages` is protected:

- All **five** CI job contexts above are **required status checks** — a push whose head commit isn't fully green shows failing checks on GitHub and PR merges into `gh-pages` stay blocked until every job passes.
- **`enforce_admins: true`** — the gate binds repository admins too; nobody can bypass a red run. Verified live: an admin attempt to fast-forward `gh-pages` to a deliberately broken commit was rejected with `GH006: Protected branch update failed — 5 of 5 required status checks are failing`.
- Force-pushes to `gh-pages` and branch deletion are disabled.

### Landing changes on `gh-pages` (staging flow)

Because direct pushes of *new* commits to `gh-pages` are declined until their checks are green, push changes through a staging branch:

```bash
# 1. stage the change on an unprotected branch — CI runs there
git push origin HEAD:refs/heads/staging
# 2. wait for all 5 jobs to pass:
#    https://github.com/Killer999908/test-keycode/actions
# 3. once green, push the same SHA to the protected branch — accepted
#    because the checks are already green on it
git push origin <green-sha>:gh-pages      # or: git push origin staging:gh-pages
# 4. tidy up
git push origin :refs/heads/staging
```

> Tip: pushing `staging:gh-pages` after the branch is deleted fails with
> "src refspec does not match" — push the green **SHA** instead, then delete.

Red badge usually means a real regression (the first red run caught committed code depending on files that were never committed) — fix the failing job's step in the run log, push, and the badge flips back.

## Get the CLI

One-liner per OS (installs `keycode` into your PATH):

```bash
# Linux / macOS / Termux
curl -fsSL https://keycode.studio/install.sh | sh
```

```powershell
# Windows PowerShell
irm https://keycode.studio/install.ps1 | iex
```

Then sign in on the website, create an API key under **API Keys**, and connect:

```bash
keycode login <kc_sk_...>
keycode agent "a portfolio site for a photographer"
```

## Local development

```bash
npm ci
npm test
npm start          # node server.js → http://localhost:3000
```

Requires Node.js 18+ and a `.env` (see `.env.example`).

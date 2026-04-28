# Agent Handoff

## Current Baseline - 2026-04-28

- This repository is the Vercel-facing dashboard package for the Meritz realtime ad spend dashboard.
- Vercel serves `public/` and proxies `/api/cache` plus `/api/collect` to the NCP Python server.
- The NCP server path is `/root/TIME` on `formads-server`.
- The NCP service is `time-dashboard.service`.
- Verified health check: `curl http://127.0.0.1:8000/health` -> `{"ok": true}`.
- Verified tunnel dashboard URL during setup: `http://127.0.0.1:18000/`.
- Last verified full collection: `2026-04-28T19:47:23+09:00`.
- Last verified totals: total `40,627,656원`, direct media `24,181,563원`, Bigcraft `16,446,093원`.

## Safety Rules

- Never commit or deploy `service-account.json`, `TEST/.env`, `cache/`, `TEST/IMG/`, `TEST/OUTPUT/`, `__pycache__/`, logs, or runtime screenshots.
- Preserve `.vercelignore`; it prevents secret/runtime files from being uploaded to Vercel.
- Keep actual Google Sheets credentials only on the NCP server.

## Runtime Notes

- Browser collectors need Xvfb. The service example uses `xvfb-run`.
- Daangn and Kakao use server Chrome profiles under `/root/TIME/chrome-profiles/`.
- If login expires, use VNC/Xvfb to refresh the server-side browser session.
- Daangn login automation was updated to handle Google OAuth account selection for `performance_team11@madup.com`.

## Vercel Notes

- Required Vercel env var: `NCP_API_BASE=http://49.50.136.239:8000`.
- Vercel cannot use a PuTTY tunnel; NCP port `8000` must be reachable from Vercel or routed through another public reverse proxy.
- If opening NCP `8000` publicly, add an API guard before relying on it for shared production use.

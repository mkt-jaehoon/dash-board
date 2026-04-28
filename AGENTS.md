# Agent Handoff

This folder is the Vercel-facing package for the Meritz realtime ad spend dashboard.

## Current Baseline

- Public dashboard: `https://time-tau-henna.vercel.app/`
- Primary GitHub repo: `https://github.com/mkt-jaehoon/dash-board`
- Mirror repo: `https://github.com/madupmarketing/mkt-11_mertiz-dash-board`
- Latest app/UI behavior commit before final handoff: `a828732323374147ad8f6149221f365564a17d7e`
- NCP runtime path: `/root/TIME`
- NCP service: `time-dashboard.service`
- Vercel env: `NCP_API_BASE=http://49.50.136.239:8000`

## Architecture

- Vercel serves `public/`.
- Vercel API functions in `api/` proxy to the NCP Python server.
- NCP owns the actual ad spend collection, Google Sheets access, browser automation, cache, and credentials.
- NCP ACG inbound `TCP 8000` is open for Vercel access.

## Required Display Semantics

- Summary `수집 기준`: actual KST collection timestamp, for example `현재 오후 8시 29분 수집 기준`.
- Bigcraft table header: spreadsheet slot basis, for example `4개 · 17시 스프레드시트 업데이트 기준`.
- Keep these separate. Direct realtime media and Bigcraft spreadsheet values do not have the same freshness source.

## Files

- `public/index.html`: page structure
- `public/styles.css`: visual design
- `public/app.js`: UI state, copy behavior, render logic
- `api/cache.js`: Vercel cache proxy
- `api/collect.js`: Vercel collect proxy
- `dashboard_server.py`: NCP API server copy
- `realtime_costs.py`: NCP collection logic copy
- `deploy/`: systemd service reference

## Safety

Never commit or deploy:

```text
service-account.json
TEST/.env
cache/
TEST/IMG/
TEST/OUTPUT/
__pycache__/
*.log
*.err
```

Preserve `.gitignore` and `.vercelignore`.

## Checks

```powershell
node --check .\public\app.js
```

NCP service checks:

```bash
systemctl status time-dashboard --no-pager
curl http://127.0.0.1:8000/health
```

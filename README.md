# Meritz Realtime Ad Spend Dashboard

Vercel 대시보드와 NCP 수집 서버로 구성된 실시간 광고비 조회 도구입니다.

## 구성

```text
public/                 Vercel 정적 대시보드
api/cache.js            Vercel -> NCP /api/cache 프록시
api/collect.js          Vercel -> NCP /api/collect 프록시
dashboard_server.py     NCP에서 실행되는 API 서버
realtime_costs.py       광고비 수집 및 캐시 로직
deploy/                 systemd 서비스 예시
```

## 운영 구조

- 사용자는 Vercel URL로 접속합니다.
- Vercel은 화면을 제공하고 `/api/*` 요청을 NCP 서버로 전달합니다.
- 실제 광고비 수집, Google Sheets 조회, 브라우저 자동화는 NCP 서버에서 실행됩니다.

## Vercel 설정

필수 환경변수:

```text
NCP_API_BASE=http://49.50.136.239:8000
```

Vercel에는 정적 화면과 JavaScript API 프록시만 배포합니다. NCP 전용 Python 파일과 런타임 파일은 `.vercelignore`로 제외합니다.

## NCP 서버 운영

서비스 이름:

```text
time-dashboard.service
```

주요 명령:

```bash
systemctl status time-dashboard --no-pager
systemctl restart time-dashboard
journalctl -u time-dashboard -n 80 --no-pager
curl http://127.0.0.1:8000/health
```

브라우저 자동화 매체가 있으므로 서버 실행에는 Xvfb 환경이 필요합니다.

## 보안 제외 파일

아래 파일은 GitHub/Vercel에 올리지 않습니다.

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

민감 파일은 NCP 서버의 `/root/TIME`에만 유지합니다.

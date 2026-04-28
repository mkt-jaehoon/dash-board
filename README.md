# Meritz Realtime Ad Spend Dashboard

실시간 광고비 대시보드입니다. Vercel은 정적 화면과 API 프록시를 담당하고, 실제 광고비 수집은 NCP 서버의 Python 수집 서버가 실행합니다.

## 현재 검증 상태

- NCP 서버: `formads-server`
- NCP 프로젝트 경로: `/root/TIME`
- 서버 서비스: `time-dashboard.service`
- 서버 내부 헬스체크: `curl http://127.0.0.1:8000/health`
- 검증 결과: `{"ok": true}`
- 터널 확인 주소: `http://127.0.0.1:18000/`
- 마지막 검증 수집: `2026-04-28T19:47:23+09:00`
- 검증 합계:
  - 전체: `40,627,656원`
  - 실시간 매체: `24,181,563원`
  - 빅크래프트: `16,446,093원`

## 구조

```text
public/                 Vercel 정적 대시보드
api/cache.js            Vercel -> NCP /api/cache 프록시
api/collect.js          Vercel -> NCP /api/collect 프록시
dashboard_server.py     NCP에서 실행되는 HTTP API 서버
realtime_costs.py       매체별 광고비 수집/캐시 로직
requirements.txt        NCP Python 의존성
deploy/                 systemd 서비스 예시
vercel.json             Vercel 라우팅 설정
.vercelignore           Vercel 업로드 제외 목록
```

## Vercel 역할

Vercel은 광고비를 직접 수집하지 않습니다. 브라우저 자동화와 Google Sheets 접근은 NCP 서버에서만 실행합니다.
따라서 `.vercelignore`는 NCP 전용 Python 파일(`dashboard_server.py`, `realtime_costs.py`, `requirements.txt`, `deploy/`)을 Vercel 업로드에서 제외합니다.

Vercel 환경변수:

```text
NCP_API_BASE=http://49.50.136.239:8000
```

Vercel 배포 후 브라우저는 Vercel 주소로 접속하고, `/api/cache`, `/api/collect` 호출은 Vercel 함수가 NCP API로 전달합니다.

## NCP 서버 실행

서버는 systemd 서비스로 실행합니다.

```bash
systemctl status time-dashboard --no-pager
systemctl restart time-dashboard
journalctl -u time-dashboard -n 80 --no-pager
curl http://127.0.0.1:8000/health
```

서비스 파일 위치:

```text
/etc/systemd/system/time-dashboard.service
```

브라우저 기반 수집 매체가 있으므로 `xvfb-run` 또는 Xvfb 환경이 필요합니다.

## 수집 방식

실시간 매체:

- 토스
- 당근
- 메타
- 카카오모먼트
- 네이버SA
- 구글
- 구글_PMAX

빅크래프트:

- 빅크래프트_메타
- 빅크래프트_카카오
- 빅크래프트_구글
- 빅크래프트_당근

브라우저 자동화 매체는 API 매체보다 느립니다. 특히 토스, 당근, 카카오모먼트가 전체 수집 시간의 대부분을 차지할 수 있습니다.

## 로그인 캐시

NCP 서버의 Chrome profile 경로:

```text
CHROME_USER_DATA=/root/TIME/chrome-profiles/daangn
CHROME_USER_DATA_KAKAO=/root/TIME/chrome-profiles/kakao
```

로그인이 만료되면 VNC/Xvfb로 서버 브라우저 화면을 열고 다시 로그인해야 합니다.

## 보안 및 제외 파일

다음 파일은 GitHub/Vercel에 올리지 않습니다.

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

`service-account.json`은 NCP 서버 `/root/TIME`에만 있어야 합니다.

## 로컬 확인

```bash
python3 -m py_compile realtime_costs.py dashboard_server.py
```

Windows 로컬에서 테스트할 때는 환경에 따라 `py`를 사용할 수 있습니다.

```powershell
py -m py_compile realtime_costs.py dashboard_server.py
```

# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlparse

from realtime_costs import collect_realtime_costs, read_cache


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
ALLOWED_TIME_SLOTS = {"10시", "15시", "17시"}
COLLECT_LOCK = Lock()


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "RealtimeCostDashboard/1.0"

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json({"ok": True})
            return
        if parsed.path == "/api/cache":
            params = parse_qs(parsed.query)
            date_value = params.get("date", [None])[0]
            payload = read_cache(date_value=date_value)
            self.send_json({"ok": payload is not None, "data": payload})
            return
        if parsed.path == "/api/collect":
            params = parse_qs(parsed.query)
            time_slot = params.get("timeSlot", [None])[0]
            self.collect_and_send(time_slot)
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/collect":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            payload = {}
        self.collect_and_send(payload.get("timeSlot"))

    def collect_and_send(self, time_slot: str | None) -> None:
        if time_slot not in ALLOWED_TIME_SLOTS:
            time_slot = None
        if not COLLECT_LOCK.acquire(blocking=False):
            self.send_json({"ok": False, "error": "collection already running"}, status=409)
            return
        try:
            payload = collect_realtime_costs(time_slot=time_slot)
            self.send_json({"ok": True, "data": payload})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)
        finally:
            COLLECT_LOCK.release()

    def serve_static(self, request_path: str) -> None:
        relative = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        target = (PUBLIC_DIR / relative).resolve()
        public_root = PUBLIC_DIR.resolve()
        if not str(target).startswith(str(public_root)) or not target.is_file():
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload: dict, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Realtime dashboard server listening on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()

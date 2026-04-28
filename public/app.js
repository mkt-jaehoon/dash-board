const apiBase = (window.REALTIME_API_BASE || "").replace(/\/$/, "");

const elements = {
  button: document.querySelector("#refreshButton"),
  copyButton: document.querySelector("#copyButton"),
  totalAll: document.querySelector("#totalAll"),
  totalDirect: document.querySelector("#totalDirect"),
  totalBigcraft: document.querySelector("#totalBigcraft"),
  collectedAt: document.querySelector("#collectedAt"),
  directRows: document.querySelector("#directRows"),
  bigcraftRows: document.querySelector("#bigcraftRows"),
  directStatus: document.querySelector("#directStatus"),
  bigcraftStatus: document.querySelector("#bigcraftStatus"),
  notice: document.querySelector("#notice"),
};

let lastPayload = null;

function won(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function statusText(status) {
  return status === "ok" ? "수집 완료" : "수집 불가";
}

function renderRows(target, rows) {
  target.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const statusClass = row.status === "ok" ? "ok" : "error";
    tr.innerHTML = `
      <td>${row.label}</td>
      <td>${row.amount === null ? "-" : won(row.amount)}</td>
      <td><span class="pill ${statusClass}">${statusText(row.status)}</span></td>
    `;
    target.appendChild(tr);
  }
}

function render(payload) {
  lastPayload = payload;
  elements.totalAll.textContent = won(payload.totals.all);
  elements.totalDirect.textContent = won(payload.totals.direct);
  elements.totalBigcraft.textContent = won(payload.totals.bigcraft);
  elements.collectedAt.textContent = `${payload.date} ${payload.timeSlot}`;
  renderRows(elements.directRows, payload.direct);
  renderRows(elements.bigcraftRows, payload.bigcraft);
  elements.directStatus.textContent = `${payload.direct.length}개`;
  elements.bigcraftStatus.textContent = `${payload.bigcraft.length}개`;
  elements.notice.textContent = `마지막 수집: ${payload.collectedAt}`;
  elements.copyButton.disabled = false;
}

function copyRows(payload) {
  return [
    ...payload.direct.map((item) => [item.label, item.amount ?? ""]),
    ...payload.bigcraft.map((item) => [item.label, item.amount ?? ""]),
    ["실시간 매체", payload.totals.direct],
    ["빅크래프트", payload.totals.bigcraft],
    ["전체", payload.totals.all],
  ];
}

function spreadsheetText(payload) {
  return copyRows(payload)
    .map((row) => row.map((cell) => String(cell).replace(/\t/g, " ")).join("\t"))
    .join("\n");
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

async function copySpreadsheet() {
  if (!lastPayload) return;
  await writeClipboard(spreadsheetText(lastPayload));
  elements.notice.textContent = "A열 매체명, B열 광고비용 형식으로 복사했습니다.";
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload.data;
}

async function loadCache() {
  try {
    const data = await requestJson(`${apiBase}/api/cache`);
    if (data) render(data);
  } catch {
    // Empty cache on first run is expected.
  }
}

async function collect() {
  elements.button.disabled = true;
  elements.button.textContent = "수집 중";
  elements.notice.textContent = "서버에서 매체별 비용을 수집 중입니다.";
  try {
    const data = await requestJson(`${apiBase}/api/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    render(data);
  } catch (error) {
    elements.notice.textContent = `수집 실패: ${error.message}`;
  } finally {
    elements.button.disabled = false;
    elements.button.textContent = "실시간 광고비 출력";
  }
}

elements.button.addEventListener("click", collect);
elements.copyButton.addEventListener("click", copySpreadsheet);
loadCache();

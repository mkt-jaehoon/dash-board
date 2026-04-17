const DEFAULT_BASE_URL = "https://api-auth.madup-dct.site";
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 800;

function getBaseUrl() {
  return (process.env.MADUP_PROXY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getApiKey() {
  const key = process.env.MADUP_PROXY_API_KEY;
  if (!key) throw new Error("MADUP_PROXY_API_KEY is not configured.");
  return key;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

async function callProxy(path: string, init: FetchInit = {}) {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": getApiKey(),
    ...(init.headers ?? {}),
  };
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    if (response.ok) return response;
    lastStatus = response.status;
    lastBody = await response.text().catch(() => "");
    if (response.status < 500 && response.status !== 429) break;
    if (attempt < MAX_ATTEMPTS) {
      const delay = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `[proxy] ${init.method ?? "GET"} ${path} attempt ${attempt} failed (${response.status}); retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw new Error(`Proxy request ${init.method ?? "GET"} ${path} failed (${lastStatus}): ${lastBody.slice(0, 200)}`);
}

export interface DropboxEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  modified?: string;
}

export interface DropboxListResult {
  path: string;
  entries: DropboxEntry[];
  count: number;
}

export async function listDropboxFolder(path: string): Promise<DropboxListResult> {
  const response = await callProxy("/api/dropbox/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const payload = (await response.json()) as { success: boolean; data?: DropboxListResult; error?: string };
  if (!payload.success || !payload.data) {
    throw new Error(payload.error || "Dropbox list failed.");
  }
  return payload.data;
}

export async function downloadDropboxFile(path: string): Promise<ArrayBuffer> {
  const response = await callProxy("/api/dropbox/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { success: boolean; data?: { content_base64?: string }; error?: string };
    if (!payload.success || !payload.data?.content_base64) {
      throw new Error(payload.error || "Dropbox download returned no content.");
    }
    const binary = Buffer.from(payload.data.content_base64, "base64");
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
  }
  return await response.arrayBuffer();
}

export async function sendSlackMessage(channel: string, text: string, threadTs?: string): Promise<boolean> {
  try {
    await callProxy("/api/slack/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text, thread_ts: threadTs }),
    });
    return true;
  } catch (error) {
    console.error("[slack] notify failed", error instanceof Error ? error.message : error);
    return false;
  }
}

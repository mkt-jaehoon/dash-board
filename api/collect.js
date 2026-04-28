const BASE_URL = (process.env.NCP_API_BASE || "").replace(/\/$/, "");

module.exports = async function handler(request, response) {
  if (!BASE_URL) {
    response.status(500).json({ ok: false, error: "NCP_API_BASE is not configured" });
    return;
  }

  if (request.method !== "POST" && request.method !== "GET") {
    response.setHeader("Allow", "GET, POST");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360000);

  try {
    const upstream = await fetch(`${BASE_URL}/api/collect`, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: request.method === "POST" ? JSON.stringify(request.body || {}) : undefined,
      signal: controller.signal,
    });
    const text = await upstream.text();
    response.status(upstream.status).setHeader("Content-Type", "application/json; charset=utf-8").send(text);
  } catch (error) {
    response.status(502).json({ ok: false, error: error.message });
  } finally {
    clearTimeout(timeout);
  }
};

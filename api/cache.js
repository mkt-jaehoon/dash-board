const BASE_URL = (process.env.NCP_API_BASE || "").replace(/\/$/, "");

module.exports = async function handler(_request, response) {
  if (!BASE_URL) {
    response.status(500).json({ ok: false, error: "NCP_API_BASE is not configured" });
    return;
  }

  try {
    const query = _request.url.includes("?") ? _request.url.slice(_request.url.indexOf("?")) : "";
    const upstream = await fetch(`${BASE_URL}/api/cache${query}`);
    const text = await upstream.text();
    response.status(upstream.status).setHeader("Content-Type", "application/json; charset=utf-8").send(text);
  } catch (error) {
    response.status(502).json({ ok: false, error: error.message });
  }
};

import http from "node:http";
import { URL } from "node:url";
import pg from "pg";

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "https://mdanson27.github.io")
    .split(",").map(v => v.trim()).filter(Boolean)
);
const pool = DATABASE_URL ? new pg.Pool({
  connectionString: DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  ssl: { rejectUnauthorized: true }
}) : null;

function respond(res, status, data, origin, method = "GET") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": status === 200 && method === "GET" ? "public, max-age=30" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function propertyShape(row) {
  return {
    id: row.id, title: row.title, description: row.description,
    city: row.city, country: row.country, address: row.address_line,
    category: row.category, intent: row.listing_intent,
    priceUgx: row.asking_price_ugx == null ? null : Number(row.asking_price_ugx),
    beds: row.bedrooms, baths: row.bathrooms, areaSqm: row.area_sqm == null ? null : Number(row.area_sqm),
    createdAt: row.created_at
  };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    if (!origin || !allowedOrigins.has(origin)) {
      return respond(res, 403, { error: "Origin not allowed" }, null);
    }
    return respond(res, 204, {}, origin);
  }
  if (req.method !== "GET") return respond(res, 405, { error: "Method not allowed" }, origin);
  let url;
  try { url = new URL(req.url, "http://localhost"); }
  catch { return respond(res, 400, { error: "Invalid URL" }, origin); }

  if (url.pathname === "/health") return respond(res, 200, { status: "ok", service: "zimba-rent-api" }, origin);
  if (!pool) return respond(res, 503, { error: "Database not configured" }, origin);
  try {
    if (url.pathname === "/ready") {
      await pool.query("SELECT 1 AS ready");
      return respond(res, 200, { status: "ready" }, origin);
    }
    if (url.pathname === "/api/v1/properties") {
      const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
      const city = (url.searchParams.get("city") || "").trim().slice(0, 90);
      const category = url.searchParams.get("category") || "";
      const intent = url.searchParams.get("intent") || "";
      const validCats = ["apartment","house","land","commercial","mixed"];
      const validIntent = ["rent","sale","internal"];
      if (category && !validCats.includes(category)) return respond(res, 400, { error: "Invalid category" }, origin);
      if (intent && !validIntent.includes(intent)) return respond(res, 400, { error: "Invalid intent" }, origin);
      const result = await pool.query(
        "SELECT * FROM public_listings WHERE ($1 = '' OR city ILIKE '%' || $1 || '%') AND ($2 = '' OR category = $2) AND ($3 = '' OR listing_intent = $3) ORDER BY created_at DESC LIMIT $4",
        [city, category, intent, limit]
      );
      return respond(res, 200, { data: result.rows.map(propertyShape), meta: { count: result.rowCount, source: "database" } }, origin);
    }
    const match = /^\/api\/v1\/properties\/([0-9a-f-]{36})$/i.exec(url.pathname);
    if (match) {
      const result = await pool.query("SELECT * FROM public_listings WHERE id = $1", [match[1]]);
      return respond(res, result.rowCount ? 200 : 404, result.rowCount ? { data: propertyShape(result.rows[0]) } : { error: "Property not found" }, origin);
    }
    return respond(res, 404, { error: "Not found" }, origin);
  } catch (error) {
    console.error("Request failed", { path: url.pathname, code: error.code || "unknown" });
    return respond(res, 503, { error: "Service temporarily unavailable" }, origin);
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 12000;
server.listen(PORT, "0.0.0.0", () => console.log("Zimba API listening on port", PORT));
process.on("SIGTERM", async () => { server.close(); await pool?.end(); });

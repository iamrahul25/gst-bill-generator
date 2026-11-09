const API = "https://api.cloudflare.com/client/v4";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) {
    throw new HttpError(
      503,
      "Cloudflare D1 is not configured. Add CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN to .env."
    );
  }
  return { accountId, databaseId, apiToken };
}

export async function d1(sql, params = []) {
  const { accountId, databaseId, apiToken } = config();
  let response;
  try {
    response = await fetch(`${API}/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
  } catch {
    throw new HttpError(502, "Could not reach Cloudflare D1.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const message = data?.errors?.map((e) => e.message).filter(Boolean).join("; ");
    const err = new Error(message || `D1 request failed (${response.status})`);
    err.status = 502;
    err.d1 = true;
    throw err;
  }
  return data.result?.[0]?.results ?? [];
}

let ready;

async function migrate() {
  await d1(`CREATE TABLE IF NOT EXISTS businesses (
    gstin TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  await d1(`CREATE TABLE IF NOT EXISTS invoice_numbers (
    invoice_id TEXT PRIMARY KEY,
    gstin TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (gstin, year, month, seq)
  )`);
}

export function ensureSchema() {
  if (!ready) {
    ready = migrate().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

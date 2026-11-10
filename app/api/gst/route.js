import { d1, ensureSchema, HttpError } from "../../lib/d1";
import { isValidGstin } from "../../lib/invoice";
import { businessPrefix, seriesPeriod } from "../../lib/gstSeries";

function json(data, status = 200) {
  return Response.json(data, { status });
}

function fail(error) {
  if (error instanceof HttpError) {
    return json({ error: error.message, ...(error.business && { business: error.business }) }, error.status);
  }
  console.error(error);
  const message = error?.d1
    ? "Could not use the GST register. Check the Cloudflare D1 settings in .env."
    : "Something went wrong.";
  return json({ error: message }, error?.status || 500);
}

function cleanGstin(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s/g, "");
}

function likeTerm(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const gstinParam = cleanGstin(url.searchParams.get("gstin"));
    if (gstinParam) {
      const businesses = await d1(
        `SELECT gstin, name FROM businesses WHERE gstin = ? LIMIT 1`,
        [gstinParam]
      );
      return json({ businesses });
    }
    const query = url.searchParams.get("q")?.trim() || "";
    if (query.length < 2) return json({ businesses: [] });
    const cleanQuery = cleanGstin(query);
    if (cleanQuery.length === 15 && isValidGstin(cleanQuery)) {
      const exact = await d1(
        `SELECT gstin, name FROM businesses WHERE gstin = ? LIMIT 1`,
        [cleanQuery]
      );
      if (exact.length) return json({ businesses: exact });
    }
    const term = likeTerm(query.slice(0, 40));
    const businesses = await d1(
      `SELECT gstin, name FROM businesses
       WHERE gstin LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
       ORDER BY name COLLATE NOCASE
       LIMIT 8`,
      [`${term}%`, `%${term}%`]
    );
    return json({ businesses });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    await ensureSchema();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new HttpError(400, "Request body must be JSON.");
    if (body.action === "generate") return json(await generateNumber(body));
    return json(await registerBusiness(body));
  } catch (error) {
    return fail(error);
  }
}

async function registerBusiness(body) {
  const gstin = cleanGstin(body.gstin);
  const name = String(body.name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!isValidGstin(gstin)) {
    throw new HttpError(400, "Enter a valid 15-character GSTIN.");
  }
  if (!name || name.length > 160) {
    throw new HttpError(400, "Enter the business name.");
  }
  const prefix = businessPrefix(name);
  if (!prefix) {
    throw new HttpError(400, "Business name needs at least one letter or number.");
  }

  const existing = await d1("SELECT gstin, name FROM businesses WHERE gstin = ?", [gstin]);
  if (existing[0]) return alreadyRegistered(existing[0]);

  try {
    await d1("INSERT INTO businesses (gstin, name, prefix, created_at) VALUES (?, ?, ?, ?)", [
      gstin,
      name,
      prefix,
      new Date().toISOString(),
    ]);
  } catch (error) {
    const raced = await d1("SELECT gstin, name FROM businesses WHERE gstin = ?", [gstin]);
    if (raced[0]) return alreadyRegistered(raced[0]);
    throw error;
  }

  return { business: { gstin, name } };
}

function alreadyRegistered(business) {
  const error = new HttpError(409, `This GST number is already stored with ${business.name}.`);
  error.business = business;
  throw error;
}

async function generateNumber(body) {
  const gstin = cleanGstin(body.gstin);
  const invoiceId = String(body.invoiceId || "").trim();
  const period = seriesPeriod(body.date);
  if (!isValidGstin(gstin)) throw new HttpError(400, "Select a registered GST number first.");
  if (!/^[a-z0-9]{8,64}$/i.test(invoiceId)) throw new HttpError(400, "This bill cannot be numbered.");
  if (!period) throw new HttpError(400, "Choose an invoice date first.");

  const business = await d1("SELECT prefix FROM businesses WHERE gstin = ?", [gstin]);
  if (!business[0]?.prefix) throw new HttpError(404, "Register this GST number before generating an invoice number.");

  const issued = await issueNumber({
    invoiceId,
    gstin,
    year: period.year,
    month: period.month,
    prefix: business[0].prefix,
  });
  return issued;
}

// One statement takes the next sequence for this GSTIN and month. The same
// bill id returns the number already issued, so a second click does not advance it.
// Numbers issued before the four-digit year were stored with a two-digit year
// (26 for 2026); the month's count continues from those.
async function issueNumber({ invoiceId, gstin, year, month, prefix }) {
  const sql = `INSERT INTO invoice_numbers (invoice_id, gstin, year, month, seq, number, created_at)
    SELECT
      ?1,
      ?2,
      ?3,
      ?4,
      COALESCE((SELECT MAX(seq) FROM invoice_numbers WHERE gstin = ?2 AND year IN (?3, ?3 % 100) AND month = ?4), 0) + 1,
      ?5 || '/' || printf('%04d', ?3) || '/' || printf('%02d', ?4) || '/' || printf('%04d',
        COALESCE((SELECT MAX(seq) FROM invoice_numbers WHERE gstin = ?2 AND year IN (?3, ?3 % 100) AND month = ?4), 0) + 1),
      ?6
    WHERE NOT EXISTS (SELECT 1 FROM invoice_numbers WHERE invoice_id = ?1)
    RETURNING number`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const inserted = await d1(sql, [invoiceId, gstin, year, month, prefix, new Date().toISOString()]);
      if (inserted[0]?.number) return { number: inserted[0].number, already: false };
      const existing = await d1("SELECT number FROM invoice_numbers WHERE invoice_id = ?", [invoiceId]);
      if (existing[0]?.number) return { number: existing[0].number, already: true };
    } catch (error) {
      const existing = await d1("SELECT number FROM invoice_numbers WHERE invoice_id = ?", [invoiceId]).catch(() => []);
      if (existing[0]?.number) return { number: existing[0].number, already: true };
      if (attempt === 1 || !/unique/i.test(error.message || "")) throw error;
    }
  }

  throw new HttpError(500, "Could not generate an invoice number.");
}

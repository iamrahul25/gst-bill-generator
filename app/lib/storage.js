const KEYS = {
  businesses: "gstbill.businesses",
  clients: "gstbill.clients",
  invoices: "gstbill.invoices",
  images: "gstbill.images",
  draft: "gstbill.draft",
  lastNumber: "gstbill.lastInvoiceNumber",
  mode: "gstbill.mode",
  gstBusinesses: "gstbill.gstBusinesses",
  gstBills: "gstbill.gstBills",
  gstDraft: "gstbill.gstDraft",
  migrated: "gstbill.migratedBills",
  linked: "gstbill.linkedBusinesses",
};

const IMAGE_FIELDS = ["logo", "signature", "stamp"];
const IMG_PREFIX = "img:";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(
      "Browser storage is full. Delete some old invoices from History or use smaller logo/signature images."
    );
  }
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + str.length.toString(36);
}

// Images are stored once in a shared map so that every saved invoice
// does not carry its own copy of the logo, signature and stamp.
function packBusiness(business, images) {
  const out = { ...business };
  for (const f of IMAGE_FIELDS) {
    const v = out[f];
    if (v && v.startsWith("data:")) {
      const id = hash(v);
      images[id] = v;
      out[f] = IMG_PREFIX + id;
    }
  }
  return out;
}

function unpackBusiness(business, images) {
  const out = { ...business };
  for (const f of IMAGE_FIELDS) {
    const v = out[f];
    if (v && v.startsWith(IMG_PREFIX)) out[f] = images[v.slice(IMG_PREFIX.length)] || "";
  }
  return out;
}

const packInvoice = (inv, images) => ({ ...inv, business: packBusiness(inv.business, images) });
const unpackInvoice = (inv, images) => ({ ...inv, business: unpackBusiness(inv.business, images) });

function collectGarbage(images) {
  const used = new Set();
  const mark = (b) => {
    for (const f of IMAGE_FIELDS) {
      const v = b?.[f];
      if (v && v.startsWith(IMG_PREFIX)) used.add(v.slice(IMG_PREFIX.length));
    }
  };
  read(KEYS.businesses, []).forEach(mark);
  read(KEYS.invoices, []).forEach((r) => mark(r.data.business));
  mark(read(KEYS.draft, null)?.business);
  read(KEYS.gstBusinesses, []).forEach(mark);
  read(KEYS.gstBills, []).forEach((r) => mark(r.data.business));
  mark(read(KEYS.gstDraft, null)?.inv?.business);
  for (const id of Object.keys(images)) if (!used.has(id)) delete images[id];
  return images;
}

export function loadAll() {
  const images = read(KEYS.images, {});
  const draft = read(KEYS.draft, null);
  return {
    businesses: read(KEYS.businesses, []).map((b) => unpackBusiness(b, images)),
    clients: read(KEYS.clients, []),
    invoices: read(KEYS.invoices, []).map((r) => ({ ...r, data: unpackInvoice(r.data, images) })),
    draft: draft ? unpackInvoice(draft, images) : null,
    lastNumber: read(KEYS.lastNumber, ""),
  };
}

export function saveDraft(inv) {
  const images = read(KEYS.images, {});
  const packed = packInvoice(inv, images);
  write(KEYS.images, images);
  write(KEYS.draft, packed);
}

function upsertProfile(list, profile, newId) {
  const name = profile.name.trim().toLowerCase();
  let idx = list.findIndex((p) => p.id === profile.id && p.name.trim().toLowerCase() === name);
  if (idx < 0) idx = list.findIndex((p) => p.name.trim().toLowerCase() === name);
  const saved = { ...profile, id: idx >= 0 ? list[idx].id : newId() };
  const next = [...list];
  if (idx >= 0) next[idx] = saved;
  else next.push(saved);
  next.sort((a, b) => a.name.localeCompare(b.name));
  return { list: next, saved };
}

function saveProfiles(key, list, packer) {
  const images = read(KEYS.images, {});
  write(key, list.map((p) => packer(p, images)));
  write(KEYS.images, collectGarbage(images));
}

export function saveBusiness(list, business, newId) {
  const res = upsertProfile(list, business, newId);
  saveProfiles(KEYS.businesses, res.list, packBusiness);
  return res;
}

export function deleteBusiness(list, id) {
  const next = list.filter((b) => b.id !== id);
  saveProfiles(KEYS.businesses, next, packBusiness);
  return next;
}

export function saveClient(list, client, newId) {
  const res = upsertProfile(list, client, newId);
  write(KEYS.clients, res.list);
  return res;
}

export function deleteClient(list, id) {
  const next = list.filter((c) => c.id !== id);
  write(KEYS.clients, next);
  return next;
}

export function saveInvoiceRecord(list, inv, total, { trackNumber = true } = {}) {
  const record = {
    id: inv.id,
    number: inv.number,
    date: inv.date,
    clientName: inv.client.name,
    total,
    gstEnabled: inv.gstEnabled,
    savedAt: Date.now(),
    data: inv,
  };
  const isNew = !list.some((r) => r.id === inv.id);
  const next = [record, ...list.filter((r) => r.id !== inv.id)];
  const images = read(KEYS.images, {});
  write(KEYS.invoices, next.map((r) => ({ ...r, data: packInvoice(r.data, images) })));
  write(KEYS.images, collectGarbage(images));
  if (isNew && trackNumber && inv.number) write(KEYS.lastNumber, inv.number);
  return next;
}

export function deleteInvoiceRecord(list, id) {
  const next = list.filter((r) => r.id !== id);
  const images = read(KEYS.images, {});
  write(KEYS.invoices, next.map((r) => ({ ...r, data: packInvoice(r.data, images) })));
  write(KEYS.images, collectGarbage(images));
  return next;
}

// ---------- GST bills ----------

export const loadMode = () => (read(KEYS.mode, "gst") === "nongst" ? "nongst" : "gst");
export const saveMode = (mode) => write(KEYS.mode, mode);

// GST invoices saved by the earlier version (with an issued number) become
// unfinished bills. Their images are already packed, so data moves as is.
function migrateBills() {
  if (read(KEYS.migrated, false)) return;
  const invoices = read(KEYS.invoices, []);
  const move = invoices.filter(
    (r) => (r.gstEnabled ?? r.data?.gstEnabled) && r.number && r.data?.numberIssued !== false
  );
  if (move.length) {
    const bills = read(KEYS.gstBills, []);
    const have = new Set(bills.map((b) => b.id));
    const added = move
      .filter((r) => !have.has(r.id))
      .map((r) => ({
        id: r.id,
        number: r.number,
        status: "unfinished",
        createdAt: r.savedAt || Date.now(),
        savedAt: r.savedAt || Date.now(),
        total: r.total,
        data: { ...r.data, gstEnabled: true, numberIssued: true },
      }));
    write(KEYS.gstBills, [...added, ...bills]);
    const ids = new Set(move.map((r) => r.id));
    write(KEYS.invoices, invoices.filter((r) => !ids.has(r.id)));
  }
  write(KEYS.migrated, true);
}

export function loadGst() {
  try {
    migrateBills();
  } catch {
    // Storage full: the old invoices stay where they are and migrate next time.
  }
  const images = read(KEYS.images, {});
  const draft = read(KEYS.gstDraft, null);
  return {
    businesses: read(KEYS.gstBusinesses, []).map((b) => unpackBusiness(b, images)),
    clients: read(KEYS.clients, []),
    bills: read(KEYS.gstBills, []).map((r) => ({ ...r, data: unpackInvoice(r.data, images) })),
    draft: draft?.inv ? { ...draft, inv: unpackInvoice(draft.inv, images) } : null,
  };
}

export function saveGstBusinesses(list) {
  saveProfiles(KEYS.gstBusinesses, list, packBusiness);
}

export function saveGstBills(list) {
  const images = read(KEYS.images, {});
  write(KEYS.gstBills, list.map((r) => ({ ...r, data: packInvoice(r.data, images) })));
  write(KEYS.images, collectGarbage(images));
}

export function saveGstDraft(draft) {
  const images = read(KEYS.images, {});
  const packed = { ...draft, inv: packInvoice(draft.inv, images) };
  write(KEYS.images, images);
  write(KEYS.gstDraft, packed);
}

export const saveClients = (list) => write(KEYS.clients, list);

// Businesses from the earlier version that had a GSTIN; the GST page links
// the ones found in the GST register, once.
export function legacyGstBusinesses() {
  if (read(KEYS.linked, false)) return [];
  const images = read(KEYS.images, {});
  return read(KEYS.businesses, [])
    .filter((b) => b.gstin)
    .map((b) => unpackBusiness(b, images));
}

export const markLegacyLinked = () => write(KEYS.linked, true);

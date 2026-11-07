export const STATES = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["97", "Other Territory"],
];

const STATE_NAMES = Object.fromEntries(STATES);

export const stateName = (code) => STATE_NAMES[code] || "";
export const stateLabel = (code) => (STATE_NAMES[code] ? `${STATE_NAMES[code]} (${code})` : "");

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isValidGstin = (v) => GSTIN_RE.test(v);
export const stateFromGstin = (v) => (v && STATE_NAMES[v.slice(0, 2)] ? v.slice(0, 2) : "");
export const panFromGstin = (v) => (v && v.length >= 12 ? v.slice(2, 12) : "");

export const COPY_LABELS = ["ORIGINAL", "DUPLICATE", "TRIPLICATE"];

export const DEFAULT_TERMS = [
  "Goods once sold will not be taken back or exchanged.",
  "All products carry only the warranty provided by the manufacturer of the product.",
  "Subject to local jurisdiction only.",
].join("\n");

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const formatDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatTime = (hhmm) => {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const moneyFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => moneyFmt.format(n || 0);

export const emptyBusiness = () => ({
  id: "",
  name: "",
  tagline: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  pan: "",
  phone: "",
  email: "",
  logo: "",
  accountName: "",
  bankName: "",
  accountNumber: "",
  ifsc: "",
  branch: "",
  upiId: "",
  signature: "",
  stamp: "",
});

export const emptyClient = () => ({
  id: "",
  name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  phone: "",
  email: "",
});

export const emptyItem = () => ({
  id: uid(),
  description: "",
  serial: "",
  hsn: "",
  qty: "1",
  unit: "Nos",
  rate: "",
  gstRate: "18",
});

export function nextInvoiceNumber(last) {
  if (!last) return "INV-0001";
  const m = last.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${last}-1`;
  const [, prefix, digits, suffix] = m;
  return prefix + String(Number(digits) + 1).padStart(digits.length, "0") + suffix;
}

export const newInvoice = ({ business, lastNumber, gstEnabled = true } = {}) => ({
  id: uid(),
  gstEnabled,
  number: nextInvoiceNumber(lastNumber),
  copyLabel: COPY_LABELS[0],
  date: todayISO(),
  vehicleNo: "",
  transportMode: "",
  time: "",
  challanNo: "",
  business: business ? { ...emptyBusiness(), ...business } : emptyBusiness(),
  client: emptyClient(),
  items: [emptyItem()],
  discount: "",
  shipping: "",
  terms: DEFAULT_TERMS,
  showQr: true,
});

// Invoices saved before the current layout had per-item discount %, notes and
// PO / due date / e-way bill / place-of-supply fields. Their item discounts are
// folded into the invoice-level discount amount; the other fields are dropped.
export function normalizeInvoice(inv) {
  const { notes, dueDate, poNumber, poDate, paymentTerms, ewayBill, otherRef, placeOfSupply, ...rest } = inv;
  const items = inv.items?.length ? inv.items : [emptyItem()];
  const legacyDiscount = round2(
    items.reduce((s, it) => s + (num(it.qty) * num(it.rate) * num(it.discount)) / 100, 0)
  );
  return {
    ...newInvoice(),
    ...rest,
    business: { ...emptyBusiness(), ...inv.business },
    client: { ...emptyClient(), ...inv.client },
    items: items.map(({ discount, ...it }) => ({ ...emptyItem(), ...it })),
    discount: inv.discount ?? (legacyDiscount ? String(legacyDiscount) : ""),
  };
}

export const isInterState = (inv) => {
  const pos = inv.client.state;
  return Boolean(inv.gstEnabled && inv.business.state && pos && inv.business.state !== pos);
};

// Discount and shipping apply to the whole invoice; they are spread across
// GST rates in proportion to each rate's share of the sub total.
export function calcInvoice(inv) {
  const inter = isInterState(inv);
  const groups = new Map();
  let gross = 0;

  const lines = inv.items.map((it) => {
    const taxable = round2(num(it.qty) * num(it.rate));
    const rate = inv.gstEnabled ? num(it.gstRate) : 0;
    gross += taxable;
    if (taxable) groups.set(rate, (groups.get(rate) || 0) + taxable);
    return { taxable, rate };
  });

  gross = round2(gross);
  const discount = round2(num(inv.discount));
  const shipping = round2(num(inv.shipping));
  const taxable = round2(Math.max(0, gross - discount + shipping));
  const factor = gross ? taxable / gross : 0;

  const taxGroups = inv.gstEnabled
    ? [...groups]
        .filter(([rate]) => rate > 0)
        .sort((a, b) => a[0] - b[0])
        .map(([rate, base]) => {
          const groupTaxable = round2(base * factor);
          const tax = round2((groupTaxable * rate) / 100);
          const cgst = round2(tax / 2);
          return { rate, taxable: groupTaxable, tax, cgst, sgst: round2(tax - cgst), igst: tax };
        })
    : [];

  const tax = round2(taxGroups.reduce((s, g) => s + g.tax, 0));
  const exact = round2(taxable + tax);
  const total = Math.round(exact);

  return {
    inter,
    lines,
    gross,
    discount,
    shipping,
    taxable,
    tax,
    taxGroups,
    roundOff: round2(total - exact),
    total,
  };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

function integerToWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

export function amountInWords(amount) {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let words = `INR ${integerToWords(rupees)}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

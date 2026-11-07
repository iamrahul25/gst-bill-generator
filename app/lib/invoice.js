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
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
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
  hsn: "",
  qty: "1",
  rate: "",
  discount: "",
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
  date: todayISO(),
  dueDate: "",
  placeOfSupply: "",
  business: business ? { ...business } : emptyBusiness(),
  client: emptyClient(),
  items: [emptyItem()],
  notes: "Thank you for your business.",
  showQr: true,
});

export const placeOfSupplyOf = (inv) => inv.placeOfSupply || inv.client.state;

export const isInterState = (inv) => {
  const pos = placeOfSupplyOf(inv);
  return Boolean(inv.gstEnabled && inv.business.state && pos && inv.business.state !== pos);
};

export function calcInvoice(inv) {
  const inter = isInterState(inv);
  const groups = new Map();
  let gross = 0;
  let discount = 0;
  let taxable = 0;
  let tax = 0;

  const lines = inv.items.map((it) => {
    const lineGross = round2(num(it.qty) * num(it.rate));
    const lineDiscount = round2((lineGross * num(it.discount)) / 100);
    const lineTaxable = round2(lineGross - lineDiscount);
    const rate = inv.gstEnabled ? num(it.gstRate) : 0;
    const lineTax = round2((lineTaxable * rate) / 100);
    const half = round2(lineTax / 2);
    const line = {
      gross: lineGross,
      discount: lineDiscount,
      taxable: lineTaxable,
      rate,
      tax: lineTax,
      cgst: inter ? 0 : half,
      sgst: inter ? 0 : round2(lineTax - half),
      igst: inter ? lineTax : 0,
    };

    gross += lineGross;
    discount += lineDiscount;
    taxable += lineTaxable;
    tax += lineTax;
    if (inv.gstEnabled && lineTaxable) {
      const g = groups.get(rate) || { rate, taxable: 0, tax: 0, cgst: 0, sgst: 0, igst: 0 };
      g.taxable += lineTaxable;
      g.tax += lineTax;
      g.cgst += line.cgst;
      g.sgst += line.sgst;
      g.igst += line.igst;
      groups.set(rate, g);
    }
    return line;
  });

  const exact = round2(taxable + tax);
  const total = Math.round(exact);

  return {
    inter,
    lines,
    gross: round2(gross),
    discount: round2(discount),
    taxable: round2(taxable),
    tax: round2(tax),
    taxGroups: [...groups.values()]
      .filter((g) => g.rate > 0)
      .sort((a, b) => a.rate - b.rate)
      .map((g) => ({
        rate: g.rate,
        taxable: round2(g.taxable),
        tax: round2(g.tax),
        cgst: round2(g.cgst),
        sgst: round2(g.sgst),
        igst: round2(g.igst),
      })),
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
  let words = `Indian Rupee ${integerToWords(rupees)}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

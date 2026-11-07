"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import QRCode from "qrcode";
import {
  COPY_LABELS,
  GST_RATES,
  amountInWords,
  calcInvoice,
  emptyBusiness,
  emptyClient,
  emptyItem,
  formatDate,
  isValidGstin,
  money,
  newInvoice,
  nextInvoiceNumber,
  normalizeInvoice,
  num,
  panFromGstin,
  stateFromGstin,
  stateLabel,
  stateName,
  todayISO,
  uid,
} from "../lib/invoice";
import * as store from "../lib/storage";
import dummy from "../data/dummy.json";
import { AutoTextarea, DateField, Field, ImageUpload, Input, StateSelect, TextArea, TimeField } from "./fields";

const BANK_FIELDS = [
  ["accountName", "Account Name"],
  ["bankName", "Bank Name"],
  ["accountNumber", "Account No."],
  ["ifsc", "IFSC"],
  ["branch", "Branch"],
  ["upiId", "UPI ID"],
];

const isBlankItem = (it) => !it.description.trim() && !num(it.rate);

const pickOther = (list, currentName) => {
  const others = list.filter((x) => x.name !== currentName);
  const pool = others.length ? others : list;
  return pool[Math.floor(Math.random() * pool.length)];
};

const TRANSPORT_MODES = ["By Road", "By Hand", "M. Bike", "Tempo", "Truck", "Courier", "Rail", "Air"];

const GSTIN_HINT = "GSTIN looks incorrect (15 characters, e.g. 29ABCDE1234F1Z5)";

// Preview reuses the real print styles by copying the rules of every
// `@media print` block into a screen stylesheet.
function printRulesCss() {
  let css = "";
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText === "print") {
        for (const inner of rule.cssRules) css += `${inner.cssText}\n`;
      }
    }
  }
  return css;
}

// A4 height minus the 10mm @page margins, in CSS px.
const PAGE_HEIGHT_PX = (277 * 96) / 25.4;
const PAGE_SAFETY_PX = 14;

// Lays the sheet out with the print rules applied on screen and decides where
// item rows break onto a new page, plus how much blank space (with column
// lines) each page needs so the items table reaches the bottom of the page and
// the totals sit at the bottom of the last page. Returns null for one-page bills.
//
// Print lays out at one device pixel per CSS px, but on a scaled display (125%,
// 150%, browser zoom) borders and line heights snap to device pixels and rows
// measure shorter than they print. Zooming the sheet by 1/devicePixelRatio
// while measuring restores the print geometry.
function measurePages(sheet) {
  if (!sheet) return null;
  const style = document.createElement("style");
  style.textContent = printRulesCss();
  document.head.appendChild(style);
  const zoom = 1 / (window.devicePixelRatio || 1);
  sheet.style.width = "190mm";
  sheet.style.zoom = String(zoom);
  try {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top / zoom, bottom: r.bottom / zoom, height: r.height / zoom };
    };
    const items = sheet.querySelector("table.items");
    const totalTop = rect(items.querySelector(".items-total")).top;
    const bodyTop = rect(sheet.tBodies[0]).top;
    const tops = [...items.querySelectorAll("tr[data-row]")]
      .filter((el) => el.getClientRects().length)
      .map((el) => ({ i: Number(el.dataset.row), top: rect(el).top }));
    if (!tops.length) return null;
    const rows = tops.map((r, k) => ({ i: r.i, h: (tops[k + 1]?.top ?? totalTop) - r.top }));

    const avail = PAGE_HEIGHT_PX - rect(sheet.tHead).height - rect(sheet.tFoot).height - PAGE_SAFETY_PX;
    const itemsHeadH = rect(items.tHead).height;
    const tailH = rect(sheet.querySelector(".cont-cover")).bottom - totalTop;
    const breaks = [];
    const fills = {};
    let used = tops[0].top - bodyTop;
    rows.forEach((r, k) => {
      const need = r.h + (k === rows.length - 1 ? tailH : 0);
      if (k > 0 && used + need > avail) {
        fills[rows[k - 1].i] = avail - used;
        breaks.push(r.i);
        used = itemsHeadH;
      }
      used += r.h;
    });
    if (!breaks.length) return null;
    const rest = avail - used - tailH;
    if (rest > 0) fills[rows.at(-1).i] = rest;
    return { breaks, fills };
  } finally {
    style.remove();
    sheet.style.width = "";
    sheet.style.zoom = "";
  }
}

function PhoneIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        fill="currentColor"
        d="M9.1 6.6c.3-.3.8-.3 1 .1l1.1 1.9c.2.3.1.7-.1 1l-.8.8a7.4 7.4 0 0 0 3.3 3.3l.8-.8c.3-.3.7-.3 1-.1l1.9 1.1c.4.2.4.7.1 1l-.9.9c-.6.6-1.5.8-2.3.5a10.6 10.6 0 0 1-6.4-6.4c-.3-.8-.1-1.7.5-2.3z"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
      />
    </svg>
  );
}

function DetailRow({ label, show = true, full, children }) {
  return (
    <div className={`detail-row ${full ? "full" : ""} ${show ? "" : "screen-only"}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-colon">:</span>
      <div className="detail-value">{children}</div>
    </div>
  );
}

function ReceiverBox({ picker, party, onChange, gst }) {
  const gstinInvalid = gst && party.gstin && !isValidGstin(party.gstin);

  return (
    <div className="box rounded receiver">
      {picker}
      <div className="detail-grid">
        <DetailRow label="Name" full>
          <Field
            value={party.name}
            onChange={(v) => onChange("name", v)}
            placeholder="Customer / Company Name"
            className="strong"
            printClassName="strong"
          />
        </DetailRow>
        <DetailRow label="Address" full show={Boolean(party.address)}>
          <TextArea
            value={party.address}
            onChange={(v) => onChange("address", v)}
            placeholder="Street / building / area"
          />
        </DetailRow>
        <DetailRow label="City" show={Boolean(party.city)}>
          <Field value={party.city} onChange={(v) => onChange("city", v)} placeholder="City / Village" />
        </DetailRow>
        <DetailRow label="PIN Code" show={Boolean(party.pincode)}>
          <Field
            value={party.pincode}
            onChange={(v) => onChange("pincode", v.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit PIN"
            inputMode="numeric"
          />
        </DetailRow>
        <DetailRow label="State" show={Boolean(party.state)}>
          <StateSelect value={party.state} onChange={(v) => onChange("state", v)} />
          {party.state ? <span className="print-only">{stateName(party.state)}</span> : null}
        </DetailRow>
        <DetailRow label="State Code" show={Boolean(party.state)}>
          <span className={`static-value ${party.state ? "" : "muted"}`}>{party.state || "—"}</span>
        </DetailRow>
        {gst ? (
          <DetailRow label="GSTIN" show={Boolean(party.gstin)}>
            <Field
              value={party.gstin}
              onChange={(v) => onChange("gstin", v)}
              placeholder="GSTIN (optional)"
              maxLength={15}
              className={gstinInvalid ? "invalid" : ""}
              printClassName="strong"
            />
            {gstinInvalid ? <div className="hint error screen-only">{GSTIN_HINT}</div> : null}
          </DetailRow>
        ) : null}
        <DetailRow label="Mob." show={Boolean(party.phone)}>
          <Field value={party.phone} onChange={(v) => onChange("phone", v)} placeholder="Mobile" inputMode="tel" />
        </DetailRow>
        <DetailRow label="Email" full show={Boolean(party.email)}>
          <Field value={party.email} onChange={(v) => onChange("email", v)} placeholder="Email" inputMode="email" />
        </DetailRow>
      </div>
    </div>
  );
}

function ProfilePicker({ items, currentId, onPick, onSave, onDelete, label }) {
  const inList = items.some((p) => p.id === currentId);
  return (
    <div className="profile-bar screen-only">
      <select value={inList ? currentId : ""} onChange={(e) => onPick(e.target.value)}>
        <option value="">{items.length ? `Pick saved ${label}…` : `No saved ${label} yet`}</option>
        {items.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        {inList ? <option value="__new">+ New {label} (blank)</option> : null}
      </select>
      <button type="button" onClick={onSave} title={`Save these ${label} details in this browser`}>
        Save
      </button>
      {inList ? (
        <button type="button" className="danger-text" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

function HistoryModal({ invoices, currentId, onOpen, onDuplicate, onDelete, onClose }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = q
    ? invoices.filter((r) => `${r.number} ${r.clientName}`.toLowerCase().includes(q))
    : invoices;

  return (
    <div className="modal-backdrop screen-only" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Saved Invoices</h2>
          <input
            className="search"
            placeholder="Search by invoice # or customer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="empty">
            {invoices.length ? "No invoices match your search." : "No saved invoices yet. Click Save or Print to store one."}
          </p>
        ) : (
          <div className="history-scroll">
            <table className="history">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.id === currentId ? "current" : ""}>
                    <td>{r.number}</td>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.clientName || "—"}</td>
                    <td>{r.gstEnabled ? "GST" : "Non-GST"}</td>
                    <td className="num">₹ {money(r.total)}</td>
                    <td className="actions">
                      <button type="button" onClick={() => onOpen(r)}>
                        Open
                      </button>
                      <button type="button" onClick={() => onDuplicate(r)}>
                        Duplicate
                      </button>
                      <button type="button" className="danger-text" onClick={() => onDelete(r)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvoiceApp() {
  const [inv, setInv] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [lastNumber, setLastNumber] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [qr, setQr] = useState("");
  const [preview, setPreview] = useState(false);
  const [printLayout, setPrintLayout] = useState(null);
  const [install, setInstall] = useState(null);
  const sheetRef = useRef(null);
  const savedSnapshot = useRef("");
  const dummySnapshot = useRef("");
  const toastTimer = useRef(null);
  const shortcutRef = useRef(null);

  useEffect(() => {
    const data = store.loadAll();
    setBusinesses(data.businesses);
    setClients(data.clients);
    setInvoices(data.invoices);
    setLastNumber(data.lastNumber);
    const initial = data.draft
      ? normalizeInvoice(data.draft)
      : newInvoice({ business: data.businesses[0], lastNumber: data.lastNumber });
    const saved = data.invoices.find((r) => r.id === initial.id);
    savedSnapshot.current = saved
      ? JSON.stringify(normalizeInvoice(saved.data))
      : data.draft
        ? ""
        : JSON.stringify(initial);
    setInv(initial);
  }, []);

  const notify = (msg, type = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), type === "error" ? 6000 : 2500);
  };

  const attempt = (fn) => {
    try {
      return fn();
    } catch (e) {
      notify(e.message, "error");
      return undefined;
    }
  };

  useEffect(() => {
    if (!inv) return;
    const t = setTimeout(() => attempt(() => store.saveDraft(inv)), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv]);

  const calc = useMemo(() => (inv ? calcInvoice(inv) : null), [inv]);
  const currentJson = useMemo(() => (inv ? JSON.stringify(inv) : ""), [inv]);

  const upiId = inv?.business.upiId.trim() ?? "";
  const upiLink =
    inv && upiId && calc.total > 0
      ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(inv.business.name || upiId)}&am=${calc.total.toFixed(
          2
        )}&cu=INR&tn=${encodeURIComponent(`Invoice ${inv.number}`)}`
      : "";

  useEffect(() => {
    if (!upiLink) {
      setQr("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(upiLink, { margin: 1, width: 300, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(""));
    return () => {
      cancelled = true;
    };
  }, [upiLink]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone) return;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    if (ios) setInstall({ ios: true });
    const onPrompt = (e) => {
      e.preventDefault();
      setInstall({ prompt: e });
    };
    const onInstalled = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        shortcutRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onBefore = () => {
      flushSync(() => setPrintLayout(null));
      const layout = measurePages(sheetRef.current);
      if (layout) flushSync(() => setPrintLayout(layout));
    };
    const onAfter = () => setPrintLayout(null);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const style = document.createElement("style");
    style.media = "screen";
    style.textContent = printRulesCss();
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    const onKey = (e) => e.key === "Escape" && setPreview(false);
    window.addEventListener("keydown", onKey);
    return () => {
      style.remove();
      window.removeEventListener("keydown", onKey);
    };
  }, [preview]);

  if (!inv) return <div className="loading">Loading…</div>;

  const gst = inv.gstEnabled;
  const b = inv.business;
  const c = inv.client;
  const isSaved = invoices.some((r) => r.id === inv.id);
  const dirty = currentJson !== savedSnapshot.current;
  const hasBank = BANK_FIELDS.some(([k]) => b[k]?.trim());
  const filledItems = inv.items.filter((it) => !isBlankItem(it));
  const totalQty = filledItems.reduce((s, it) => s + num(it.qty), 0);
  const units = [...new Set(filledItems.map((it) => it.unit.trim()).filter(Boolean))];
  const qtyUnit = units.length === 1 ? units[0] : "";
  const termLines = b.terms
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const tailStart = Math.max(
    inv.items.findLastIndex((it) => !isBlankItem(it)),
    0
  );

  const update = (patch) => setInv((p) => ({ ...p, ...patch }));

  const updateParty = (party) => (field, value) =>
    setInv((p) => {
      const next = { ...p[party], [field]: value };
      if (field === "gstin") {
        next.gstin = value.toUpperCase().replace(/\s/g, "");
        const st = stateFromGstin(next.gstin);
        if (st && !p[party].state) next.state = st;
        const prev = p[party];
        if ("pan" in prev && (!prev.pan || prev.pan === panFromGstin(prev.gstin))) next.pan = panFromGstin(next.gstin);
      }
      return { ...p, [party]: next };
    });
  const setBiz = updateParty("business");
  const setClient = updateParty("client");

  const setItem = (id, field, value) =>
    setInv((p) => ({ ...p, items: p.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)) }));
  const addItem = () =>
    setInv((p) => ({
      ...p,
      items: [...p.items, { ...emptyItem(), gstRate: p.items.at(-1)?.gstRate ?? "18" }],
    }));
  const removeItem = (id) =>
    setInv((p) => ({
      ...p,
      items: p.items.length > 1 ? p.items.filter((it) => it.id !== id) : [emptyItem()],
    }));

  const confirmDiscard = () =>
    !dirty || confirm("You have unsaved changes on this invoice. Discard them?");

  const pickBusiness = (id) => {
    if (id === "__new") return update({ business: emptyBusiness() });
    const found = businesses.find((x) => x.id === id);
    if (found) update({ business: { ...emptyBusiness(), ...found } });
  };

  const saveBusinessProfile = () => {
    if (!b.name.trim()) return notify("Enter your business name first.", "error");
    attempt(() => {
      const { list, saved } = store.saveBusiness(businesses, b, uid);
      setBusinesses(list);
      setInv((p) => ({ ...p, business: { ...p.business, id: saved.id } }));
      notify("Business details saved in this browser.");
    });
  };

  const deleteBusinessProfile = () => {
    if (!confirm(`Delete saved business "${b.name}"? (This invoice keeps its details.)`)) return;
    attempt(() => {
      setBusinesses(store.deleteBusiness(businesses, b.id));
      setInv((p) => ({ ...p, business: { ...p.business, id: "" } }));
    });
  };

  const pickClient = (id) => {
    if (id === "__new") return update({ client: emptyClient() });
    const found = clients.find((x) => x.id === id);
    if (found) update({ client: { ...found } });
  };

  const saveClientProfile = () => {
    if (!c.name.trim()) return notify("Enter the customer name first.", "error");
    attempt(() => {
      const { list, saved } = store.saveClient(clients, c, uid);
      setClients(list);
      setInv((p) => ({ ...p, client: { ...p.client, id: saved.id } }));
      notify("Customer details saved in this browser.");
    });
  };

  const deleteClientProfile = () => {
    if (!confirm(`Delete saved customer "${c.name}"? (This invoice keeps its details.)`)) return;
    attempt(() => {
      setClients(store.deleteClient(clients, c.id));
      setInv((p) => ({ ...p, client: { ...p.client, id: "" } }));
    });
  };

  const persistInvoice = () =>
    attempt(() => {
      let business = b;
      let client = c;
      let bList = businesses;
      let cList = clients;
      if (business.name.trim()) ({ list: bList, saved: business } = store.saveBusiness(bList, business, uid));
      if (client.name.trim()) ({ list: cList, saved: client } = store.saveClient(cList, client, uid));
      const next = { ...inv, business, client };
      const list = store.saveInvoiceRecord(invoices, next, calc.total);
      if (!isSaved) setLastNumber(next.number);
      setBusinesses(bList);
      setClients(cList);
      setInvoices(list);
      setInv(next);
      savedSnapshot.current = JSON.stringify(next);
      return true;
    });

  const numberClash = () =>
    invoices.some((r) => r.id !== inv.id && r.number.trim().toLowerCase() === inv.number.trim().toLowerCase());

  const handleSave = () => {
    if (!inv.number.trim()) return notify("Enter an invoice number.", "error");
    if (numberClash() && !confirm(`Invoice number ${inv.number} is already used by another saved invoice. Save anyway?`))
      return;
    if (persistInvoice()) notify(`Invoice ${inv.number} saved.`);
  };
  shortcutRef.current = handleSave;

  const handlePrint = () => {
    if (inv.number.trim() && !numberClash()) persistInvoice();
    const prevTitle = document.title;
    document.title = [inv.number, c.name].filter(Boolean).join(" - ") || prevTitle;
    window.addEventListener("afterprint", () => (document.title = prevTitle), { once: true });
    setTimeout(() => window.print(), 100);
  };

  const handleInstall = async () => {
    if (install.ios) {
      notify('To install: tap the Share button, then "Add to Home Screen".');
      return;
    }
    install.prompt.prompt();
    const { outcome } = await install.prompt.userChoice;
    setInstall(null);
    if (outcome === "accepted") notify("Installing GST Bill Generator as an app…");
  };

  const fillDummyData = () => {
    if (currentJson !== dummySnapshot.current && !confirmDiscard()) return;
    const { items, discount, shipping, terms, ...business } = pickOther(dummy.businesses, b.name);
    const client = pickOther(dummy.customers, c.name);
    const next = {
      ...inv,
      business: { ...emptyBusiness(), ...business, pan: panFromGstin(business.gstin), terms: terms.join("\n") },
      client: { ...emptyClient(), ...client },
      items: items.map((it) => ({ ...emptyItem(), ...it })),
      discount,
      shipping,
    };
    dummySnapshot.current = JSON.stringify(next);
    setInv(next);
    notify(`Filled dummy data: ${business.name} → ${client.name}`);
  };

  const handleNew = () => {
    if (!confirmDiscard()) return;
    const next = newInvoice({ business: b, lastNumber, gstEnabled: gst });
    savedSnapshot.current = JSON.stringify(next);
    setInv(next);
  };

  const openInvoice = (rec) => {
    if (rec.id !== inv.id && !confirmDiscard()) return;
    const data = normalizeInvoice(rec.data);
    setInv(data);
    savedSnapshot.current = JSON.stringify(data);
    setHistoryOpen(false);
  };

  const duplicateInvoice = (rec) => {
    if (!confirmDiscard()) return;
    const data = normalizeInvoice(rec.data);
    const latestBusiness = businesses.find((x) => x.id === data.business.id);
    const latestClient = clients.find((x) => x.id === data.client.id);
    const next = {
      ...data,
      id: uid(),
      number: nextInvoiceNumber(lastNumber),
      copyLabel: COPY_LABELS[0],
      date: todayISO(),
      vehicleNo: "",
      time: "",
      challanNo: "",
      business: latestBusiness ? { ...emptyBusiness(), ...latestBusiness } : data.business,
      client: latestClient ? { ...emptyClient(), ...latestClient } : data.client,
      items: data.items.map((it) => ({ ...it, id: uid() })),
    };
    savedSnapshot.current = "";
    setInv(next);
    setHistoryOpen(false);
    notify(`Copied as new invoice ${next.number}.`);
  };

  const deleteInvoice = (rec) => {
    if (!confirm(`Delete invoice ${rec.number}? This cannot be undone.`)) return;
    attempt(() => {
      setInvoices(store.deleteInvoiceRecord(invoices, rec.id));
      if (rec.id === inv.id) savedSnapshot.current = "";
    });
  };

  const status = !isSaved ? ["Not saved", "warn"] : dirty ? ["Unsaved changes", "warn"] : ["Saved", "ok"];
  const bizAddressLine = [
    b.address
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(", "),
    [b.city, b.pincode].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(", ");
  const bizExtras = [
    b.state && `State: ${stateLabel(b.state)}`,
    b.pan && `PAN: ${b.pan}`,
    b.email && `Email: ${b.email}`,
  ].filter(Boolean);
  const bizGstinInvalid = gst && b.gstin && !isValidGstin(b.gstin);

  const itemRow = (it, i) => {
    const l = calc.lines[i];
    const fill = printLayout?.fills[i];
    const rowClass = [
      isBlankItem(it) && "blank-row",
      printLayout?.breaks.includes(i) && "page-start",
      printLayout && i in printLayout.fills && !(fill > 0) && "page-end",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <Fragment key={it.id}>
        <tr data-row={i} className={rowClass}>
          <td className="c-sn">{i + 1}</td>
          <td className="c-desc">
            <TextArea
              value={it.description}
              onChange={(v) => setItem(it.id, "description", v)}
              placeholder="Product name / description"
            />
          </td>
          <td className="c-serial">
            <TextArea value={it.serial} onChange={(v) => setItem(it.id, "serial", v)} placeholder="Serial no." />
          </td>
          <td className="c-qty">
            <div className="qty-unit screen-only">
              <Input numeric value={it.qty} onChange={(v) => setItem(it.id, "qty", v)} placeholder="0" />
              <Input value={it.unit} onChange={(v) => setItem(it.id, "unit", v)} placeholder="Unit" />
            </div>
            <span className="print-only">
              {it.qty} {it.unit}
            </span>
          </td>
          {gst ? (
            <td className="c-hsn">
              <Field value={it.hsn} onChange={(v) => setItem(it.id, "hsn", v)} placeholder="HSN" />
            </td>
          ) : null}
          {gst ? (
            <td className="c-gst">
              <select
                className="field select screen-only"
                value={it.gstRate}
                onChange={(e) => setItem(it.id, "gstRate", e.target.value)}
              >
                {GST_RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {r} %
                  </option>
                ))}
              </select>
              <span className="print-only">{l.rate} %</span>
            </td>
          ) : null}
          <td className="c-rate num">
            <Field
              numeric
              value={it.rate}
              printValue={money(num(it.rate))}
              onChange={(v) => setItem(it.id, "rate", v)}
              placeholder="0.00"
            />
          </td>
          <td className="c-amt num">{money(l.taxable)}</td>
          <td className="c-del screen-only">
            <button type="button" className="icon-btn" onClick={() => removeItem(it.id)} title="Remove item">
              ×
            </button>
          </td>
        </tr>
        {fill ? (
          <tr className="fill-row print-only" aria-hidden="true">
            <td className="c-sn" style={{ height: fill }} />
            <td className="c-desc" />
            <td className="c-serial" />
            <td className="c-qty" />
            {gst ? <td className="c-hsn" /> : null}
            {gst ? <td className="c-gst" /> : null}
            <td className="c-rate" />
            <td className="c-amt" />
          </tr>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div className={`app ${preview ? "previewing" : ""}`}>
      {preview ? (
        <div className="preview-bar">
          <span className="preview-note">Print preview (press Esc to go back)</span>
          <div className="spacer" />
          <button type="button" onClick={() => setPreview(false)}>
            Back to Edit
          </button>
          <button type="button" className="primary" onClick={handlePrint}>
            Print
          </button>
        </div>
      ) : null}
      <header className="toolbar screen-only">
        <div className="brand">GST Bill Generator</div>
        <div className="seg" role="group" aria-label="Bill type">
          <button type="button" className={gst ? "active" : ""} onClick={() => update({ gstEnabled: true })}>
            GST Bill
          </button>
          <button type="button" className={!gst ? "active" : ""} onClick={() => update({ gstEnabled: false })}>
            Non-GST Bill
          </button>
        </div>
        <div className="spacer" />
        <span className={`status ${status[1]}`}>{status[0]}</span>
        {install ? (
          <button type="button" onClick={handleInstall} title="Install this as an app on your computer or phone">
            Install App
          </button>
        ) : null}
        <button type="button" onClick={fillDummyData} title="Fill a random sample business, customer and items">
          Dummy Data
        </button>
        <button type="button" onClick={handleNew}>
          New
        </button>
        <button type="button" onClick={() => setHistoryOpen(true)}>
          History ({invoices.length})
        </button>
        <button type="button" onClick={handleSave} title="Ctrl+S">
          Save
        </button>
        <button type="button" onClick={() => setPreview(true)} title="See how the invoice will print">
          Preview
        </button>
        <button type="button" className="primary" onClick={handlePrint}>
          Print
        </button>
      </header>

      <main className="paper-wrap">
        <article className="paper">
          <table className="sheet" ref={sheetRef}>
            <thead>
              <tr>
                <td>
                  <header className="box rounded inv-head">
                    <ProfilePicker
                      label="business"
                      items={businesses}
                      currentId={b.id}
                      onPick={pickBusiness}
                      onSave={saveBusinessProfile}
                      onDelete={deleteBusinessProfile}
                    />
                    <div className="inv-head-bar">
                      <div className="head-gstin">
                        {gst ? (
                          <>
                            <span className={b.gstin ? "" : "screen-only"}>GSTIN :</span>
                            <Field
                              value={b.gstin}
                              onChange={(v) => setBiz("gstin", v)}
                              placeholder="GSTIN (optional)"
                              maxLength={15}
                              className={bizGstinInvalid ? "invalid" : ""}
                            />
                          </>
                        ) : null}
                      </div>
                      <div className="doc-tab">
                        <div className="copy-label">
                          <select
                            className="field select screen-only"
                            value={inv.copyLabel}
                            onChange={(e) => update({ copyLabel: e.target.value })}
                            aria-label="Invoice copy"
                          >
                            {COPY_LABELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <span className="print-only">{inv.copyLabel}</span>
                        </div>
                        <div className="doc-title">{gst ? "TAX INVOICE" : "INVOICE"}</div>
                      </div>
                      <div className="head-phone">
                        <span className={b.phone ? "" : "screen-only"}>
                          <PhoneIcon />
                        </span>
                        <Field
                          value={b.phone}
                          onChange={(v) => setBiz("phone", v)}
                          placeholder="Phone"
                          inputMode="tel"
                        />
                      </div>
                    </div>
                    {bizGstinInvalid ? <div className="hint error screen-only head-hint">{GSTIN_HINT}</div> : null}
                    <div className="inv-head-body">
                      <ImageUpload
                        value={b.logo}
                        onChange={(v) => setBiz("logo", v)}
                        label="Upload Logo"
                        hint="PNG / JPG"
                        className="logo"
                        maxW={600}
                        maxH={300}
                      />
                      <div className="inv-head-main">
                        <Field
                          value={b.name}
                          onChange={(v) => setBiz("name", v)}
                          placeholder="YOUR BUSINESS NAME"
                          className="biz-title"
                          printClassName="biz-title"
                        />
                        <Field
                          value={b.tagline}
                          onChange={(v) => setBiz("tagline", v)}
                          placeholder="What you deal in, e.g. PLYWOOD, LAMINATES, FLUSH DOOR ETC."
                          className="biz-tagline"
                          printClassName="biz-tagline"
                        />
                        <div className="detail-grid biz-form screen-only">
                          <DetailRow label="Address" full>
                            <AutoTextarea
                              value={b.address}
                              onChange={(v) => setBiz("address", v)}
                              placeholder="Street / building / area"
                            />
                          </DetailRow>
                          <DetailRow label="City">
                            <Input value={b.city} onChange={(v) => setBiz("city", v)} placeholder="City / Village" />
                          </DetailRow>
                          <DetailRow label="PIN Code">
                            <Input
                              value={b.pincode}
                              onChange={(v) => setBiz("pincode", v.replace(/\D/g, "").slice(0, 6))}
                              placeholder="6-digit PIN"
                              inputMode="numeric"
                            />
                          </DetailRow>
                          <DetailRow label="State">
                            <StateSelect value={b.state} onChange={(v) => setBiz("state", v)} />
                          </DetailRow>
                          <DetailRow label="State Code">
                            <span className={`static-value ${b.state ? "" : "muted"}`}>{b.state || "—"}</span>
                          </DetailRow>
                          <DetailRow label="PAN">
                            <Input
                              value={b.pan}
                              onChange={(v) => setBiz("pan", v.toUpperCase().replace(/\s/g, ""))}
                              placeholder="Optional (auto from GSTIN)"
                              maxLength={10}
                            />
                          </DetailRow>
                          <DetailRow label="Email">
                            <Input
                              value={b.email}
                              onChange={(v) => setBiz("email", v)}
                              placeholder="Optional"
                              inputMode="email"
                            />
                          </DetailRow>
                        </div>
                        {bizAddressLine ? (
                          <div className="print-only">
                            <div className="biz-address">
                              <PinIcon />
                              <span>{bizAddressLine}</span>
                            </div>
                          </div>
                        ) : null}
                        {bizExtras.length ? (
                          <div className="print-only biz-extra">{bizExtras.join("  |  ")}</div>
                        ) : null}
                      </div>
                    </div>
                  </header>
                  <div className="cont-strip print-only">
                    <div className="cont-bar">
                      <span>
                        <b>Invoice No.:</b> {inv.number}
                        {inv.date ? (
                          <>
                            {"  |  "}
                            <b>Date:</b> {formatDate(inv.date)}
                          </>
                        ) : null}
                      </span>
                      {c.name ? (
                        <span className="cont-client">
                          <b>Bill To:</b> {c.name}
                        </span>
                      ) : null}
                      <span className="cont-note">Continued from previous page</span>
                    </div>
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <section className="top-details">
                    <ReceiverBox
                      picker={
                        <ProfilePicker
                          label="customer"
                          items={clients}
                          currentId={c.id}
                          onPick={pickClient}
                          onSave={saveClientProfile}
                          onDelete={deleteClientProfile}
                        />
                      }
                      party={c}
                      onChange={setClient}
                      gst={gst}
                    />
                    <div className="box rounded meta-box">
                      <DetailRow label="Invoice No.">
                        <Field
                          value={inv.number}
                          onChange={(v) => update({ number: v })}
                          placeholder="INV-0001"
                          className="inv-no"
                          printClassName="inv-no"
                        />
                      </DetailRow>
                      <DetailRow label="Date">
                        <DateField value={inv.date} onChange={(v) => update({ date: v })} />
                      </DetailRow>
                      <DetailRow label="Vehicle No." show={Boolean(inv.vehicleNo)}>
                        <Field
                          value={inv.vehicleNo}
                          onChange={(v) => update({ vehicleNo: v.toUpperCase() })}
                          placeholder="e.g. HR05AB1234"
                        />
                      </DetailRow>
                      <DetailRow label="Transportation Mode" show={Boolean(inv.transportMode)}>
                        <Field
                          value={inv.transportMode}
                          onChange={(v) => update({ transportMode: v })}
                          placeholder="e.g. By Road, M. Bike"
                          list="transport-modes"
                        />
                        <datalist id="transport-modes">
                          {TRANSPORT_MODES.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                      </DetailRow>
                      <DetailRow label="Time" show={Boolean(inv.time)}>
                        <TimeField value={inv.time} onChange={(v) => update({ time: v })} />
                      </DetailRow>
                      <DetailRow label="Challan No." show={Boolean(inv.challanNo)}>
                        <Field
                          value={inv.challanNo}
                          onChange={(v) => update({ challanNo: v })}
                          placeholder="Challan no."
                        />
                      </DetailRow>
                    </div>
                  </section>
                  {gst ? (
                    <div className={`supply-type screen-only ${calc.inter ? "inter" : ""}`}>
                      {!b.state || !c.state
                        ? "Select the sender's and receiver's state to decide CGST+SGST or IGST."
                        : calc.inter
                          ? "Inter-state supply: IGST applies"
                          : "Intra-state supply: CGST + SGST apply"}
                    </div>
                  ) : null}

                  <table className="items">
                    <thead>
                      <tr>
                        <th className="c-sn">S.No.</th>
                        <th className="c-desc">Product Name</th>
                        <th className="c-serial">Product Serial No.</th>
                        <th className="c-qty">Qty</th>
                        {gst ? <th className="c-hsn">HSN/SAC</th> : null}
                        {gst ? <th className="c-gst">GST</th> : null}
                        <th className="c-rate">Unit Price</th>
                        <th className="c-amt">{gst ? "Total Taxable Value" : "Amount"}</th>
                        <th className="c-del screen-only" />
                      </tr>
                    </thead>
                    {tailStart > 0 ? <tbody>{inv.items.slice(0, tailStart).map((it, i) => itemRow(it, i))}</tbody> : null}
                    <tbody className="items-tail">
                      {inv.items.slice(tailStart).map((it, i) => itemRow(it, tailStart + i))}
                      <tr className="items-total">
                        <td colSpan={3} className="qty-label">
                          Total Quantity
                        </td>
                        <td className="c-qty">
                          {totalQty} {qtyUnit}
                        </td>
                        <td colSpan={gst ? 4 : 2} />
                        <td className="c-del screen-only" />
                      </tr>
                    </tbody>
                  </table>
                  <button type="button" className="add-line screen-only" onClick={addItem}>
                    + Add Line Item
                  </button>

                  <section className="box summary-box">
                    <div className="summary-left">
                      <div className="words-cell">
                        <div className="strong">Total Invoice Amount in Words</div>
                        <div>{amountInWords(calc.total)}</div>
                      </div>
                      <div className={`bank ${hasBank ? "" : "screen-only"}`}>
                        <div className="label">Payment Details</div>
                        <div className="bank-edit screen-only">
                          {BANK_FIELDS.map(([key, label]) => (
                            <label key={key}>
                              <span>{label}</span>
                              <Input
                                value={b[key]}
                                onChange={(v) => setBiz(key, key === "ifsc" ? v.toUpperCase() : v)}
                                placeholder={key === "upiId" ? "yourname@upi" : label}
                              />
                            </label>
                          ))}
                          <div className="hint">Saved with your business profile.</div>
                        </div>
                        <div className="bank-body">
                          <table className="bank-print print-only">
                            <tbody>
                              {BANK_FIELDS.filter(([k]) => b[k]?.trim()).map(([key, label]) => (
                                <tr key={key}>
                                  <th>{label}</th>
                                  <td>{b[key]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {qr && inv.showQr ? (
                            <div className="qr">
                              <img src={qr} alt="UPI payment QR code" />
                              <div>Scan to pay with any UPI app</div>
                            </div>
                          ) : null}
                        </div>
                        {upiId ? (
                          <label className="check screen-only">
                            <input
                              type="checkbox"
                              checked={inv.showQr}
                              onChange={(e) => update({ showQr: e.target.checked })}
                            />
                            Show UPI QR code for ₹ {money(calc.total)}
                          </label>
                        ) : null}
                      </div>
                    </div>
                    <div className="summary-right">
                      <table className="totals">
                        <tbody>
                          <tr>
                            <th>Sub Total</th>
                            <td className="num">{money(calc.gross)}</td>
                          </tr>
                          <tr className={calc.discount > 0 ? "" : "screen-only"}>
                            <th>Discount</th>
                            <td className="num">
                              <Input
                                numeric
                                value={inv.discount}
                                onChange={(v) => update({ discount: v })}
                                placeholder="0.00"
                              />
                              <span className="print-only">(-) {money(calc.discount)}</span>
                            </td>
                          </tr>
                          <tr className={calc.shipping > 0 ? "" : "screen-only"}>
                            <th>Shipping Charges</th>
                            <td className="num">
                              <Input
                                numeric
                                value={inv.shipping}
                                onChange={(v) => update({ shipping: v })}
                                placeholder="0.00"
                              />
                              <span className="print-only">{money(calc.shipping)}</span>
                            </td>
                          </tr>
                          {calc.discount > 0 || calc.shipping > 0 ? (
                            <tr>
                              <th>{gst ? "Taxable Value" : "Net Amount"}</th>
                              <td className="num">{money(calc.taxable)}</td>
                            </tr>
                          ) : null}
                          {calc.taxGroups.map((g) =>
                            calc.inter ? (
                              <tr key={g.rate}>
                                <th>Output IGST {g.rate} %</th>
                                <td className="num">{money(g.igst)}</td>
                              </tr>
                            ) : (
                              <TaxPair key={g.rate} group={g} />
                            )
                          )}
                          {calc.roundOff !== 0 ? (
                            <tr>
                              <th>Round Off</th>
                              <td className="num">
                                {calc.roundOff > 0 ? "(+)" : "(-)"} {money(Math.abs(calc.roundOff))}
                              </td>
                            </tr>
                          ) : null}
                          <tr className="grand">
                            <th>Total</th>
                            <td className="num">₹ {money(calc.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="sign">
                        <div className="strong">For {b.name || "Your Business"}</div>
                        <div className="sign-images">
                          <ImageUpload
                            value={b.stamp}
                            onChange={(v) => setBiz("stamp", v)}
                            label="Upload Stamp"
                            className="stamp"
                            maxW={360}
                            maxH={360}
                          />
                          <ImageUpload
                            value={b.signature}
                            onChange={(v) => setBiz("signature", v)}
                            label="Upload Signature"
                            className="signature"
                            maxW={600}
                            maxH={240}
                          />
                        </div>
                        <div className="sign-line">Authorised Signatory</div>
                      </div>
                    </div>
                  </section>

                  <section className={`box terms-box ${termLines.length ? "" : "screen-only"}`}>
                    <div className="box-title">Terms &amp; Conditions</div>
                    <AutoTextarea
                      value={b.terms}
                      onChange={(v) => setBiz("terms", v)}
                      placeholder="One term per line"
                      minRows={3}
                    />
                    <div className="hint screen-only">Saved with your business profile.</div>
                    <ol className="print-only">
                      {termLines.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>
                  </section>
                  <div className="cont-cover print-only" />
                </td>
              </tr>
            </tbody>
            <tfoot className="print-only">
              <tr>
                <td>
                  <div className="sheet-foot-text">Continued on next page…</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </article>
      </main>

      {historyOpen ? (
        <HistoryModal
          invoices={invoices}
          currentId={inv.id}
          onOpen={openInvoice}
          onDuplicate={duplicateInvoice}
          onDelete={deleteInvoice}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {toast ? <div className={`toast screen-only ${toast.type}`}>{toast.msg}</div> : null}
    </div>
  );
}

function TaxPair({ group }) {
  return (
    <>
      <tr>
        <th>Output CGST {group.rate / 2} %</th>
        <td className="num">{money(group.cgst)}</td>
      </tr>
      <tr>
        <th>Output SGST {group.rate / 2} %</th>
        <td className="num">{money(group.sgst)}</td>
      </tr>
    </>
  );
}

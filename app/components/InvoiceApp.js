"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
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
  num,
  placeOfSupplyOf,
  stateFromGstin,
  stateLabel,
  stateName,
  todayISO,
  uid,
} from "../lib/invoice";
import * as store from "../lib/storage";
import dummy from "../data/dummy.json";
import { AutoTextarea, Field, ImageUpload, Input, StateSelect, TextArea } from "./fields";

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

function PartyBlock({ party, onChange, gst, kind }) {
  const isBusiness = kind === "business";
  const cityLine = [party.city, gst ? "" : stateName(party.state)].filter(Boolean).join(", ");
  const gstinInvalid = gst && party.gstin && !isValidGstin(party.gstin);

  return (
    <>
      <div className="party-edit screen-only">
        <Input
          value={party.name}
          onChange={(v) => onChange("name", v)}
          placeholder={isBusiness ? "Your Business Name" : "Customer / Company Name"}
          className="strong"
        />
        <AutoTextarea
          value={party.address}
          onChange={(v) => onChange("address", v)}
          placeholder={isBusiness ? "Business Address" : "Customer Address"}
        />
        <div className="grid-2">
          <Input value={party.city} onChange={(v) => onChange("city", v)} placeholder="City" />
          <Input
            value={party.pincode}
            onChange={(v) => onChange("pincode", v.replace(/\D/g, "").slice(0, 6))}
            placeholder="PIN code"
            inputMode="numeric"
          />
        </div>
        <StateSelect value={party.state} onChange={(v) => onChange("state", v)} />
        {gst ? (
          <>
            <Input
              value={party.gstin}
              onChange={(v) => onChange("gstin", v)}
              placeholder={isBusiness ? "Your GSTIN" : "Customer GSTIN (optional)"}
              maxLength={15}
              className={gstinInvalid ? "invalid" : ""}
            />
            {gstinInvalid ? <div className="hint error">GSTIN looks incorrect (15 characters, e.g. 29ABCDE1234F1Z5)</div> : null}
          </>
        ) : null}
        <div className="grid-2">
          <Input value={party.phone} onChange={(v) => onChange("phone", v)} placeholder="Phone" inputMode="tel" />
          <Input value={party.email} onChange={(v) => onChange("email", v)} placeholder="Email" inputMode="email" />
        </div>
      </div>

      <div className="party-print print-only">
        {party.name ? <div className={isBusiness ? "biz-name" : "party-name"}>{party.name}</div> : null}
        {party.address ? <div className="pre">{party.address}</div> : null}
        {cityLine || party.pincode ? (
          <div>
            {cityLine}
            {party.pincode ? `${cityLine ? " - " : ""}${party.pincode}` : ""}
          </div>
        ) : null}
        {gst && party.state ? <div>State: {stateLabel(party.state)}</div> : null}
        {gst && party.gstin ? (
          <div>
            GSTIN: <b>{party.gstin}</b>
          </div>
        ) : null}
        {party.phone ? <div>Phone: {party.phone}</div> : null}
        {party.email ? <div>Email: {party.email}</div> : null}
      </div>
    </>
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
    const initial = data.draft ?? newInvoice({ business: data.businesses[0], lastNumber: data.lastNumber });
    const saved = data.invoices.find((r) => r.id === initial.id);
    savedSnapshot.current = saved ? JSON.stringify(saved.data) : data.draft ? "" : JSON.stringify(initial);
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
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        shortcutRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!inv) return <div className="loading">Loading…</div>;

  const gst = inv.gstEnabled;
  const b = inv.business;
  const c = inv.client;
  const isSaved = invoices.some((r) => r.id === inv.id);
  const dirty = currentJson !== savedSnapshot.current;
  const showDiscount = inv.items.some((it) => num(it.discount) > 0);
  const hasBank = BANK_FIELDS.some(([k]) => b[k]?.trim());

  const update = (patch) => setInv((p) => ({ ...p, ...patch }));

  const updateParty = (party) => (field, value) =>
    setInv((p) => {
      const next = { ...p[party], [field]: value };
      if (field === "gstin") {
        next.gstin = value.toUpperCase().replace(/\s/g, "");
        const st = stateFromGstin(next.gstin);
        if (st && !p[party].state) next.state = st;
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
    if (found) update({ business: { ...found } });
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
    if (id === "__new") return update({ client: emptyClient(), placeOfSupply: "" });
    const found = clients.find((x) => x.id === id);
    if (found) update({ client: { ...found }, placeOfSupply: "" });
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

  const fillDummyData = () => {
    if (currentJson !== dummySnapshot.current && !confirmDiscard()) return;
    const { items, ...business } = pickOther(dummy.businesses, b.name);
    const client = pickOther(dummy.customers, c.name);
    const next = {
      ...inv,
      business: { ...emptyBusiness(), ...business },
      client: { ...emptyClient(), ...client },
      placeOfSupply: "",
      items: items.map((it) => ({ ...emptyItem(), ...it })),
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
    setInv(rec.data);
    savedSnapshot.current = JSON.stringify(rec.data);
    setHistoryOpen(false);
  };

  const duplicateInvoice = (rec) => {
    if (!confirmDiscard()) return;
    const latestBusiness = businesses.find((x) => x.id === rec.data.business.id);
    const latestClient = clients.find((x) => x.id === rec.data.client.id);
    const next = {
      ...rec.data,
      id: uid(),
      number: nextInvoiceNumber(lastNumber),
      date: todayISO(),
      dueDate: "",
      business: latestBusiness ? { ...latestBusiness } : rec.data.business,
      client: latestClient ? { ...latestClient } : rec.data.client,
      items: rec.data.items.map((it) => ({ ...it, id: uid() })),
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
  const pos = placeOfSupplyOf(inv);

  return (
    <div className="app">
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
        <button type="button" className="primary" onClick={handlePrint}>
          Print
        </button>
      </header>

      <main className="paper-wrap">
        <article className="paper">
          <section className="row head">
            <div className="col business">
              <ProfilePicker
                label="business"
                items={businesses}
                currentId={b.id}
                onPick={pickBusiness}
                onSave={saveBusinessProfile}
                onDelete={deleteBusinessProfile}
              />
              <ImageUpload
                value={b.logo}
                onChange={(v) => setBiz("logo", v)}
                label="Upload Logo"
                hint="PNG / JPG"
                className="logo"
                maxW={600}
                maxH={300}
              />
              <PartyBlock party={b} onChange={setBiz} gst={gst} kind="business" />
            </div>
            <div className="col right">
              <h1 className="title">{gst ? "TAX INVOICE" : "INVOICE"}</h1>
            </div>
          </section>

          <section className="row bill">
            <div className="col client">
              <div className="label">Bill To</div>
              <ProfilePicker
                label="customer"
                items={clients}
                currentId={c.id}
                onPick={pickClient}
                onSave={saveClientProfile}
                onDelete={deleteClientProfile}
              />
              <PartyBlock party={c} onChange={setClient} gst={gst} kind="client" />
            </div>
            <div className="col right">
              <table className="meta">
                <tbody>
                  <tr>
                    <th>Invoice #</th>
                    <td>
                      <Field value={inv.number} onChange={(v) => update({ number: v })} placeholder="INV-0001" />
                    </td>
                  </tr>
                  <tr>
                    <th>Invoice Date</th>
                    <td>
                      <input
                        type="date"
                        className="field screen-only"
                        value={inv.date}
                        onChange={(e) => update({ date: e.target.value })}
                      />
                      <span className="print-only">{formatDate(inv.date)}</span>
                    </td>
                  </tr>
                  <tr className={inv.dueDate ? "" : "screen-only"}>
                    <th>Due Date</th>
                    <td>
                      <input
                        type="date"
                        className="field screen-only"
                        value={inv.dueDate}
                        min={inv.date}
                        onChange={(e) => update({ dueDate: e.target.value })}
                      />
                      <span className="print-only">{formatDate(inv.dueDate)}</span>
                    </td>
                  </tr>
                  {gst ? (
                    <tr className={pos ? "" : "screen-only"}>
                      <th>Place of Supply</th>
                      <td>
                        <StateSelect
                          value={inv.placeOfSupply}
                          onChange={(v) => update({ placeOfSupply: v })}
                          placeholder={c.state ? `Customer's state (${stateName(c.state)})` : "Customer's state"}
                        />
                        <span className="print-only">{stateLabel(pos)}</span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              {gst ? (
                <div className={`supply-type screen-only ${calc.inter ? "inter" : ""}`}>
                  {!b.state || !pos
                    ? "Select your state and the customer's state to decide CGST+SGST or IGST."
                    : calc.inter
                      ? "Inter-state supply: IGST applies"
                      : "Intra-state supply: CGST + SGST apply"}
                </div>
              ) : null}
            </div>
          </section>

          <table className={`items ${showDiscount ? "" : "no-discount"}`}>
            <thead>
              <tr>
                <th className="c-sn">#</th>
                <th className="c-desc">Item &amp; Description</th>
                {gst ? <th className="c-hsn">HSN/SAC</th> : null}
                <th className="c-qty num">Qty</th>
                <th className="c-rate num">Rate</th>
                <th className="c-disc num">Disc %</th>
                {gst ? <th className="c-gst num">GST %</th> : null}
                {gst && calc.inter ? <th className="c-tax num">IGST</th> : null}
                {gst && !calc.inter ? (
                  <>
                    <th className="c-tax num">CGST</th>
                    <th className="c-tax num">SGST</th>
                  </>
                ) : null}
                <th className="c-amt num">Amount</th>
                <th className="c-del screen-only" />
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it, i) => {
                const l = calc.lines[i];
                return (
                  <tr key={it.id} className={isBlankItem(it) ? "blank-row" : ""}>
                    <td className="c-sn">{i + 1}</td>
                    <td className="c-desc">
                      <TextArea
                        value={it.description}
                        onChange={(v) => setItem(it.id, "description", v)}
                        placeholder="Product / service name"
                      />
                    </td>
                    {gst ? (
                      <td className="c-hsn">
                        <Field value={it.hsn} onChange={(v) => setItem(it.id, "hsn", v)} placeholder="HSN" />
                      </td>
                    ) : null}
                    <td className="c-qty num">
                      <Field numeric value={it.qty} onChange={(v) => setItem(it.id, "qty", v)} placeholder="0" />
                    </td>
                    <td className="c-rate num">
                      <Field
                        numeric
                        value={it.rate}
                        printValue={money(num(it.rate))}
                        onChange={(v) => setItem(it.id, "rate", v)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="c-disc num">
                      <Field
                        numeric
                        value={it.discount}
                        onChange={(v) => setItem(it.id, "discount", num(v) > 100 ? "100" : v)}
                        placeholder="0"
                      />
                    </td>
                    {gst ? (
                      <td className="c-gst num">
                        <select
                          className="field select screen-only"
                          value={it.gstRate}
                          onChange={(e) => setItem(it.id, "gstRate", e.target.value)}
                        >
                          {GST_RATES.map((r) => (
                            <option key={r} value={String(r)}>
                              {r}%
                            </option>
                          ))}
                        </select>
                        <span className="print-only">{l.rate}%</span>
                      </td>
                    ) : null}
                    {gst && calc.inter ? (
                      <td className="c-tax num">
                        <div>{money(l.igst)}</div>
                        <small>{l.rate}%</small>
                      </td>
                    ) : null}
                    {gst && !calc.inter ? (
                      <>
                        <td className="c-tax num">
                          <div>{money(l.cgst)}</div>
                          <small>{l.rate / 2}%</small>
                        </td>
                        <td className="c-tax num">
                          <div>{money(l.sgst)}</div>
                          <small>{l.rate / 2}%</small>
                        </td>
                      </>
                    ) : null}
                    <td className="c-amt num">{money(l.taxable)}</td>
                    <td className="c-del screen-only">
                      <button type="button" className="icon-btn" onClick={() => removeItem(it.id)} title="Remove item">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="add-line screen-only" onClick={addItem}>
            + Add Line Item
          </button>

          <section className="row summary">
            <div className="col">
              <div className="block">
                <div className="label">Amount in Words</div>
                <div className="words">{amountInWords(calc.total)}</div>
              </div>
              <div className={`block ${inv.notes ? "" : "screen-only"}`}>
                <div className="label">Notes</div>
                <TextArea value={inv.notes} onChange={(v) => update({ notes: v })} placeholder="Notes for the customer" />
              </div>
            </div>
            <div className="col">
              <table className="totals">
                <tbody>
                  <tr>
                    <td>Sub Total</td>
                    <td className="num">{money(calc.gross)}</td>
                  </tr>
                  {calc.discount > 0 ? (
                    <>
                      <tr>
                        <td>Discount</td>
                        <td className="num">- {money(calc.discount)}</td>
                      </tr>
                      <tr>
                        <td>{gst ? "Taxable Amount" : "Amount after Discount"}</td>
                        <td className="num">{money(calc.taxable)}</td>
                      </tr>
                    </>
                  ) : null}
                  {gst
                    ? calc.taxGroups.map((g) =>
                        calc.inter ? (
                          <tr key={g.rate}>
                            <td>IGST ({g.rate}%)</td>
                            <td className="num">{money(g.igst)}</td>
                          </tr>
                        ) : (
                          <TaxPair key={g.rate} group={g} />
                        )
                      )
                    : null}
                  {gst ? (
                    <tr className="subtle">
                      <td>Total GST</td>
                      <td className="num">{money(calc.tax)}</td>
                    </tr>
                  ) : null}
                  {calc.roundOff !== 0 ? (
                    <tr>
                      <td>Round Off</td>
                      <td className="num">
                        {calc.roundOff > 0 ? "+" : "-"} {money(Math.abs(calc.roundOff))}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="grand">
                    <td>TOTAL</td>
                    <td className="num">₹ {money(calc.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="row pay">
            <div className={`col bank ${hasBank ? "" : "screen-only"}`}>
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
                  <input type="checkbox" checked={inv.showQr} onChange={(e) => update({ showQr: e.target.checked })} />
                  Show UPI QR code for ₹ {money(calc.total)}
                </label>
              ) : null}
            </div>
            <div className="col sign">
              <div>
                For <b>{b.name || "Your Business"}</b>
              </div>
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
          </section>

          <footer className="paper-foot">This is a computer-generated invoice.</footer>
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

      {toast ? <div className={`toast ${toast.type}`}>{toast.msg}</div> : null}
    </div>
  );
}

function TaxPair({ group }) {
  return (
    <>
      <tr>
        <td>CGST ({group.rate / 2}%)</td>
        <td className="num">{money(group.cgst)}</td>
      </tr>
      <tr>
        <td>SGST ({group.rate / 2}%)</td>
        <td className="num">{money(group.sgst)}</td>
      </tr>
    </>
  );
}

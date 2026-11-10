"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  COPY_LABELS,
  DEFAULT_TERMS,
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
  panFromGstin,
  stateFromGstin,
  todayISO,
  uid,
} from "../lib/invoice";
import * as store from "../lib/storage";
import dummy from "../data/dummy.json";
import { AutoTextarea, StateSelect } from "./fields";
import InvoiceSheet from "./InvoiceSheet";
import { printWithTitle, upiLinkFor, usePreview, usePrintLayout, useQr } from "./print";
import { useToast } from "./ui";

const pickOther = (list, currentName) => {
  const others = list.filter((x) => x.name !== currentName);
  const pool = others.length ? others : list;
  return pool[Math.floor(Math.random() * pool.length)];
};

function ProfilePicker({ items, currentId, onPick, onNew, label }) {
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
      </select>
      <button type="button" onClick={onNew} title={`Add new ${label}`}>
        New
      </button>
    </div>
  );
}

function BusinessModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    tagline: "",
    gstin: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    pan: "",
    accountName: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    branch: "",
    upiId: "",
    terms: DEFAULT_TERMS,
  });
  const [error, setError] = useState("");
  const titleId = useId();
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "gstin") {
        const clean = value.toUpperCase().replace(/\s/g, "");
        next.gstin = clean;
        const st = stateFromGstin(clean);
        if (st && !prev.state) next.state = st;
        if (!prev.pan || prev.pan === panFromGstin(prev.gstin)) {
          next.pan = panFromGstin(clean);
        }
      }
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Enter the business name.");
      nameRef.current?.focus();
      return;
    }
    const cleanGst = form.gstin.toUpperCase().replace(/\s/g, "");
    if (cleanGst && !isValidGstin(cleanGst)) {
      setError("Enter a valid 15-character GSTIN (or leave it blank).");
      return;
    }
    onSave({
      ...form,
      name: trimmedName,
      gstin: cleanGst,
      pan: form.pan.toUpperCase().replace(/\s/g, ""),
      pincode: form.pincode.replace(/\D/g, "").slice(0, 6),
    });
  };

  return (
    <div className="modal-backdrop screen-only" onClick={onClose}>
      <div
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>New Business Details</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="profile-form" onSubmit={submit}>
          <label>
            Business name *
            <input
              ref={nameRef}
              value={form.name}
              maxLength={160}
              placeholder="e.g. Acme Enterprises"
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>

          <label>
            Tagline / deals in
            <input
              value={form.tagline}
              maxLength={160}
              placeholder="e.g. Wholesale Dealer of Electronics"
              onChange={(e) => setField("tagline", e.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              GSTIN
              <input
                value={form.gstin}
                maxLength={15}
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="15-character GSTIN"
                onChange={(e) => setField("gstin", e.target.value)}
              />
            </label>
            <label>
              PAN
              <input
                value={form.pan}
                maxLength={10}
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="10-digit PAN"
                onChange={(e) => setField("pan", e.target.value.toUpperCase().replace(/\s/g, ""))}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Phone / Mobile
              <input
                value={form.phone}
                type="tel"
                placeholder="Phone number"
                onChange={(e) => setField("phone", e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                value={form.email}
                type="email"
                placeholder="Email address"
                onChange={(e) => setField("email", e.target.value)}
              />
            </label>
          </div>

          <label>
            Address
            <textarea
              value={form.address}
              placeholder="Street / Building / Area"
              onChange={(e) => setField("address", e.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              City / Town
              <input
                value={form.city}
                placeholder="City / Village"
                onChange={(e) => setField("city", e.target.value)}
              />
            </label>
            <label>
              PIN Code
              <input
                value={form.pincode}
                maxLength={6}
                inputMode="numeric"
                placeholder="6-digit PIN"
                onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
          </div>

          <label>
            State
            <StateSelect value={form.state} onChange={(val) => setField("state", val)} />
          </label>

          <div className="section-heading">Bank Details (Optional)</div>

          <div className="form-row">
            <label>
              Bank Name
              <input
                value={form.bankName}
                placeholder="Bank Name"
                onChange={(e) => setField("bankName", e.target.value)}
              />
            </label>
            <label>
              Account Name
              <input
                value={form.accountName}
                placeholder="Account Holder Name"
                onChange={(e) => setField("accountName", e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Account Number
              <input
                value={form.accountNumber}
                placeholder="Account Number"
                onChange={(e) => setField("accountNumber", e.target.value)}
              />
            </label>
            <label>
              IFSC Code
              <input
                value={form.ifsc}
                maxLength={11}
                autoCapitalize="characters"
                placeholder="IFSC Code"
                onChange={(e) => setField("ifsc", e.target.value.toUpperCase().replace(/\s/g, ""))}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Branch
              <input
                value={form.branch}
                placeholder="Branch"
                onChange={(e) => setField("branch", e.target.value)}
              />
            </label>
            <label>
              UPI ID
              <input
                value={form.upiId}
                placeholder="e.g. business@upi"
                onChange={(e) => setField("upiId", e.target.value.trim())}
              />
            </label>
          </div>

          <div className="section-heading">Terms &amp; Conditions</div>
          <label>
            Invoice terms
            <AutoTextarea
              value={form.terms}
              onChange={(v) => setField("terms", v)}
              placeholder="One term per line"
              minRows={4}
            />
            <span className="hint">Saved with this business and printed on every invoice.</span>
          </label>

          {error ? (
            <div className="hint error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="register-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    gstin: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [error, setError] = useState("");
  const titleId = useId();
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "gstin") {
        const clean = value.toUpperCase().replace(/\s/g, "");
        next.gstin = clean;
        const st = stateFromGstin(clean);
        if (st && !prev.state) next.state = st;
      }
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Enter the customer name.");
      nameRef.current?.focus();
      return;
    }
    const cleanGst = form.gstin.toUpperCase().replace(/\s/g, "");
    if (cleanGst && !isValidGstin(cleanGst)) {
      setError("Enter a valid 15-character GSTIN (or leave it blank).");
      return;
    }
    onSave({
      ...form,
      name: trimmedName,
      gstin: cleanGst,
      pincode: form.pincode.replace(/\D/g, "").slice(0, 6),
    });
  };

  return (
    <div className="modal-backdrop screen-only" onClick={onClose}>
      <div
        className="modal profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>New Customer Details</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="profile-form" onSubmit={submit}>
          <label>
            Customer / Company name *
            <input
              ref={nameRef}
              value={form.name}
              maxLength={160}
              placeholder="e.g. John Doe / XYZ Corp"
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>

          <label>
            GSTIN (optional)
            <input
              value={form.gstin}
              maxLength={15}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="15-character GSTIN"
              onChange={(e) => setField("gstin", e.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              Phone / Mobile
              <input
                value={form.phone}
                type="tel"
                placeholder="Phone number"
                onChange={(e) => setField("phone", e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                value={form.email}
                type="email"
                placeholder="Email address"
                onChange={(e) => setField("email", e.target.value)}
              />
            </label>
          </div>

          <label>
            Address
            <textarea
              value={form.address}
              placeholder="Street / Building / Area"
              onChange={(e) => setField("address", e.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              City / Town
              <input
                value={form.city}
                placeholder="City / Village"
                onChange={(e) => setField("city", e.target.value)}
              />
            </label>
            <label>
              PIN Code
              <input
                value={form.pincode}
                maxLength={6}
                inputMode="numeric"
                placeholder="6-digit PIN"
                onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
          </div>

          <label>
            State
            <StateSelect value={form.state} onChange={(val) => setField("state", val)} />
          </label>

          {error ? (
            <div className="hint error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="register-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save
            </button>
          </div>
        </form>
      </div>
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
                    <td className="h-number">{r.number}</td>
                    <td className="h-date">{formatDate(r.date)}</td>
                    <td className="h-client">{r.clientName || "—"}</td>
                    <td className="h-type">{r.gstEnabled ? "GST" : "Non-GST"}</td>
                    <td className="num h-amount">₹ {money(r.total)}</td>
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

export default function NonGstApp({ modeSwitch, installButton }) {
  const [inv, setInv] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [clients, setClients] = useState([]);
  const [allInvoices, setInvoices] = useState([]);
  const [lastNumber, setLastNumber] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bizModalOpen, setBizModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [toastNode, notify] = useToast();
  const sheetRef = useRef(null);
  const savedSnapshot = useRef("");
  const dummySnapshot = useRef("");
  const shortcutRef = useRef(null);
  const latest = useRef(null);
  const printLayout = usePrintLayout(sheetRef);
  const exitPreview = useCallback(() => setPreview(false), []);
  usePreview(preview, exitPreview);

  const invoices = useMemo(() => allInvoices.filter((r) => !r.gstEnabled), [allInvoices]);

  const attempt = (fn) => {
    try {
      return fn();
    } catch (e) {
      notify(e.message, "error");
      return undefined;
    }
  };

  useEffect(() => {
    const data = store.loadAll();
    setBusinesses(data.businesses);
    setClients(data.clients);
    setInvoices(data.invoices);
    setLastNumber(data.lastNumber);
    const draft = data.draft && !data.draft.gstEnabled ? data.draft : null;
    const initial = draft
      ? normalizeInvoice(draft)
      : newInvoice({ business: data.businesses[0], lastNumber: data.lastNumber, gstEnabled: false });
    const saved = data.invoices.find((r) => r.id === initial.id);
    savedSnapshot.current = saved
      ? JSON.stringify(normalizeInvoice(saved.data))
      : draft
        ? ""
        : JSON.stringify(initial);
    setInv(initial);
  }, []);

  useEffect(() => {
    if (!inv) return;
    latest.current = inv;
    const t = setTimeout(() => attempt(() => store.saveDraft(inv)), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv]);

  // Switching to GST mode unmounts this page; keep the last keystrokes.
  useEffect(
    () => () => {
      if (latest.current) {
        try {
          store.saveDraft(latest.current);
        } catch {}
      }
    },
    []
  );

  const calc = useMemo(() => (inv ? calcInvoice(inv) : null), [inv]);
  const currentJson = useMemo(() => (inv ? JSON.stringify(inv) : ""), [inv]);
  const qr = useQr(upiLinkFor(inv, calc?.total));

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

  const b = inv.business;
  const c = inv.client;
  const isSaved = invoices.some((r) => r.id === inv.id);
  const dirty = currentJson !== savedSnapshot.current;

  const update = (patch) => setInv((p) => ({ ...p, ...patch }));

  const confirmDiscard = () => !dirty || confirm("You have unsaved changes on this invoice. Discard them?");

  const pickBusiness = (id) => {
    if (id === "__new") return update({ business: emptyBusiness() });
    const found = businesses.find((x) => x.id === id);
    if (!found) return;
    const gstin = (found.gstin || "").toUpperCase().replace(/\s/g, "");
    update({ business: { ...emptyBusiness(), ...found, gstin } });
  };

  const handleSaveNewBusiness = (newBiz) => {
    attempt(() => {
      const { list, saved } = store.saveBusiness(businesses, newBiz, uid);
      setBusinesses(list);
      setInv((p) => ({ ...p, business: { ...emptyBusiness(), ...p.business, ...saved } }));
      setBizModalOpen(false);
      notify(`Saved business "${saved.name}".`);
    });
  };

  const pickClient = (id) => {
    if (id === "__new" || !id) return update({ client: emptyClient() });
    const found = clients.find((x) => x.id === id);
    if (found) update({ client: { ...found } });
  };

  const handleSaveNewClient = (newClient) => {
    attempt(() => {
      const { list, saved } = store.saveClient(clients, newClient, uid);
      setClients(list);
      setInv((p) => ({ ...p, client: { ...emptyClient(), ...p.client, ...saved } }));
      setClientModalOpen(false);
      notify(`Saved customer "${saved.name}".`);
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
      const list = store.saveInvoiceRecord(allInvoices, next, calc.total);
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
    printWithTitle([inv.number, c.name].filter(Boolean).join(" - "));
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
    const next = newInvoice({ lastNumber, gstEnabled: false });
    savedSnapshot.current = "";
    dummySnapshot.current = "";
    setHistoryOpen(false);
    setInv(next);
    attempt(() => store.saveDraft(next));
  };

  const openInvoice = (rec) => {
    if (rec.id !== inv.id && !confirmDiscard()) return;
    const data = normalizeInvoice({ ...rec.data });
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
      setInvoices(store.deleteInvoiceRecord(allInvoices, rec.id));
      if (rec.id === inv.id) savedSnapshot.current = "";
    });
  };

  const status = !isSaved ? ["Not saved", "warn"] : dirty ? ["Unsaved changes", "warn"] : ["Saved", "ok"];

  return (
    <div className={`app ${preview ? "previewing" : "responsive"}`}>
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
        {modeSwitch}
        <div className="spacer" />
        <span className={`status ${status[1]}`}>{status[0]}</span>
        <div className="toolbar-actions">
          {installButton}
          <button type="button" onClick={fillDummyData} title="Fill a random sample business, customer and items">
            Dummy Data
          </button>
          <button type="button" onClick={handleNew}>
            New
          </button>
          <button type="button" onClick={() => setHistoryOpen(true)}>
            History ({invoices.length})
          </button>
        </div>
        <div className="toolbar-main">
          <button type="button" onClick={handleSave} title="Ctrl+S">
            Save
          </button>
          <button type="button" onClick={() => setPreview(true)} title="See how the invoice will print">
            Preview
          </button>
          <button type="button" className="primary" onClick={handlePrint}>
            Print
          </button>
        </div>
      </header>

      <InvoiceSheet
        inv={inv}
        calc={calc}
        setInv={setInv}
        sheetRef={sheetRef}
        printLayout={printLayout}
        qr={qr}
        bizEditable
        bizPicker={
          <ProfilePicker
            label="business"
            items={businesses}
            currentId={b.id}
            onPick={pickBusiness}
            onNew={() => setBizModalOpen(true)}
          />
        }
        clientPicker={
          <ProfilePicker
            label="customer"
            items={clients}
            currentId={c.id}
            onPick={pickClient}
            onNew={() => setClientModalOpen(true)}
          />
        }
      />

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

      {bizModalOpen ? (
        <BusinessModal onClose={() => setBizModalOpen(false)} onSave={handleSaveNewBusiness} />
      ) : null}

      {clientModalOpen ? (
        <ClientModal onClose={() => setClientModalOpen(false)} onSave={handleSaveNewClient} />
      ) : null}

      {toastNode}
    </div>
  );
}

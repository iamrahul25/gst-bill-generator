"use client";

import { useState } from "react";
import { DEFAULT_TERMS, emptyProfile, isValidGstin, panFromGstin, stateFromGstin, todayISO, uid } from "../lib/invoice";
import { businessPrefix } from "../lib/gstSeries";
import { AutoTextarea, ImageUpload, StateSelect } from "./fields";
import { Modal } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanGstin = (v) => v.toUpperCase().replace(/\s/g, "");

function MultiInput({ label, values, onChange, type, placeholder, addLabel, required }) {
  const list = values.length ? values : [""];
  const set = (i, v) => onChange(list.map((x, k) => (k === i ? v : x)));
  return (
    <div className="multi-input">
      <span className="multi-label">
        {label}
        {required ? " *" : ""}
      </span>
      {list.map((value, i) => (
        <div className="multi-row" key={i}>
          <input type={type} value={value} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
          {list.length > 1 ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              onClick={() => onChange(list.filter((_, k) => k !== i))}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => onChange([...list, ""])}>
        + {addLabel}
      </button>
    </div>
  );
}

// Registers a new GST business (GSTIN + name go to the GST register, which
// starts its invoice series) or edits a saved one. GSTIN and name never change
// after registration.
export default function BusinessForm({ profile, businesses, onSaved, onClose }) {
  const editing = Boolean(profile);
  const [form, setForm] = useState(() =>
    profile ? { ...emptyProfile(), ...profile } : { ...emptyProfile(), terms: DEFAULT_TERMS }
  );
  const [error, setError] = useState("");
  const [linkable, setLinkable] = useState(null);
  const [pending, setPending] = useState(false);

  const setField = (field, value) => {
    setLinkable(null);
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "gstin") {
        const clean = cleanGstin(value);
        next.gstin = clean;
        const st = stateFromGstin(clean);
        if (st && (!prev.state || prev.state === stateFromGstin(prev.gstin))) next.state = st;
        if (!prev.pan || prev.pan === panFromGstin(prev.gstin)) next.pan = panFromGstin(clean);
      }
      return next;
    });
  };

  const validate = () => {
    if (!editing) {
      if (!isValidGstin(form.gstin)) return "Enter a valid 15-character GSTIN, e.g. 29ABCDE1234F1Z5.";
      const name = form.name.trim();
      if (!name) return "Enter the business name.";
      if (!businessPrefix(name)) return "Business name needs at least one letter or number.";
    }
    const phones = form.phones.map((p) => p.trim()).filter(Boolean);
    if (!phones.length) return "Enter at least one phone number.";
    if (phones.some((p) => !/^[0-9+\-\s()]{6,20}$/.test(p))) return "A phone number looks incorrect.";
    const emails = form.emails.map((e) => e.trim()).filter(Boolean);
    if (emails.some((e) => !EMAIL_RE.test(e))) return "An email address looks incorrect.";
    if (form.pincode && form.pincode.length !== 6) return "PIN code must be 6 digits.";
    if (form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan)) return "PAN looks incorrect (e.g. ABCDE1234F).";
    if (form.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc)) return "IFSC code looks incorrect (e.g. HDFC0001234).";
    return "";
  };

  const finish = (extra) => {
    const clean = (list) => list.map((v) => v.trim()).filter(Boolean);
    onSaved({
      ...form,
      ...extra,
      name: (extra?.name ?? form.name).trim().replace(/\s+/g, " "),
      phones: clean(form.phones),
      emails: clean(form.emails),
      pincode: form.pincode.replace(/\D/g, "").slice(0, 6),
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (editing) {
      finish({ id: profile.id, gstin: profile.gstin, name: profile.name });
      return;
    }
    const local = businesses.find((b) => b.gstin === form.gstin);
    if (local) {
      setError(`This GST number is already stored with ${local.name}.`);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: form.gstin, name: form.name.trim().replace(/\s+/g, " ") }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.business) {
        setError(data.error);
        setLinkable(data.business);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Could not register this GST number.");
      finish({ id: uid(), gstin: data.business.gstin, name: data.business.name, registeredAt: new Date().toISOString() });
    } catch (err) {
      setError(err.message || "Could not register this GST number.");
    } finally {
      setPending(false);
    }
  };

  const linkHere = () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    finish({ id: uid(), gstin: linkable.gstin, name: linkable.name, registeredAt: new Date().toISOString() });
  };

  return (
    <Modal
      title={editing ? `Edit ${profile.name}` : "Register New Business"}
      onClose={onClose}
      busy={pending}
      className="profile-modal business-modal"
    >
      <form className="profile-form" onSubmit={submit} noValidate>
        <div className="section-heading">Business Details</div>
        <div className="form-row">
          <label>
            GSTIN *
            <input
              value={form.gstin}
              maxLength={15}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="15-character GSTIN"
              disabled={editing}
              autoFocus={!editing}
              onChange={(e) => setField("gstin", e.target.value)}
            />
          </label>
          <label>
            Business name *
            <input
              value={form.name}
              maxLength={160}
              placeholder="e.g. Shri Prabhu Ply"
              disabled={editing}
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>
        </div>
        {editing ? (
          <p className="register-note">GSTIN and business name cannot be changed after registration.</p>
        ) : (
          <p className="register-note">
            Invoice numbers use the first letter of each word of the name and the invoice date:
            {` ${businessPrefix(form.name) || "SPP"}/${todayISO().slice(0, 7).replace("-", "/")}/0001`}. GSTIN and name
            cannot be changed later.
          </p>
        )}

        <label>
          Tagline / deals in
          <input
            value={form.tagline}
            maxLength={160}
            placeholder="e.g. Plywood, Laminates, Flush Doors"
            onChange={(e) => setField("tagline", e.target.value)}
          />
        </label>

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
            City
            <input value={form.city} placeholder="City / Village" onChange={(e) => setField("city", e.target.value)} />
          </label>
          <label>
            State
            <StateSelect value={form.state} onChange={(v) => setField("state", v)} />
          </label>
        </div>

        <div className="form-row">
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
          <label>
            PAN
            <input
              value={form.pan}
              maxLength={10}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="10-character PAN"
              onChange={(e) => setField("pan", e.target.value.toUpperCase().replace(/\s/g, ""))}
            />
          </label>
        </div>

        <div className="form-row">
          <MultiInput
            label="Phone Number"
            values={form.phones}
            onChange={(v) => setField("phones", v)}
            type="tel"
            placeholder="Phone number"
            addLabel="Add phone"
            required
          />
          <MultiInput
            label="Email"
            values={form.emails}
            onChange={(v) => setField("emails", v)}
            type="email"
            placeholder="Email address"
            addLabel="Add email"
          />
        </div>

        <div className="section-heading">Payment Details</div>
        <div className="form-row">
          <label>
            Account Name
            <input
              value={form.accountName}
              placeholder="Account holder name"
              onChange={(e) => setField("accountName", e.target.value)}
            />
          </label>
          <label>
            Bank Name
            <input value={form.bankName} placeholder="Bank name" onChange={(e) => setField("bankName", e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Account Number
            <input
              value={form.accountNumber}
              inputMode="numeric"
              placeholder="Account number"
              onChange={(e) => setField("accountNumber", e.target.value.replace(/\s/g, ""))}
            />
          </label>
          <label>
            IFSC Code
            <input
              value={form.ifsc}
              maxLength={11}
              autoCapitalize="characters"
              placeholder="e.g. HDFC0001234"
              onChange={(e) => setField("ifsc", e.target.value.toUpperCase().replace(/\s/g, ""))}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Branch
            <input value={form.branch} placeholder="Branch" onChange={(e) => setField("branch", e.target.value)} />
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

        <div className="section-heading">Logo, Stamp &amp; Signature</div>
        <div className="form-images">
          <ImageUpload
            value={form.logo}
            onChange={(v) => setField("logo", v)}
            label="Upload Logo"
            hint="PNG / JPG"
            className="logo"
            maxW={600}
            maxH={300}
          />
          <ImageUpload
            value={form.stamp}
            onChange={(v) => setField("stamp", v)}
            label="Upload Stamp"
            className="stamp"
            maxW={360}
            maxH={360}
          />
          <ImageUpload
            value={form.signature}
            onChange={(v) => setField("signature", v)}
            label="Upload Signature"
            className="signature"
            maxW={600}
            maxH={240}
          />
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
          <span className="hint">Printed on every invoice of this business.</span>
        </label>

        {error ? (
          <div className="form-error" role="alert">
            <span>{error}</span>
            {linkable ? (
              <>
                <span className="form-error-note">
                  It is registered, but not on this device yet. Add it here to bill with it; its invoice series continues.
                </span>
                <button type="button" className="primary" onClick={linkHere}>
                  Add {linkable.name} to this device
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="register-actions">
          <button type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={pending}>
            {pending ? "Registering…" : editing ? "Save Changes" : "Register"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

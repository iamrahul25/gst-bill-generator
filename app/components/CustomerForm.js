"use client";

import { useState } from "react";
import { emptyClient, isValidGstin, stateFromGstin, uid } from "../lib/invoice";
import { StateSelect } from "./fields";
import { Modal } from "./ui";

// Saved customers live only in this browser. The GSTIN is optional and is not
// registered anywhere.
export default function CustomerForm({ customer, onSave, onClose }) {
  const editing = Boolean(customer);
  const [form, setForm] = useState(() => ({ ...emptyClient(), ...customer }));
  const [error, setError] = useState("");

  const setField = (field, value) =>
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "gstin") {
        next.gstin = value.toUpperCase().replace(/\s/g, "");
        const st = stateFromGstin(next.gstin);
        if (st && (!prev.state || prev.state === stateFromGstin(prev.gstin))) next.state = st;
      }
      return next;
    });

  const submit = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) return setError("Enter the customer name.");
    if (!phone) return setError("Enter the customer phone number.");
    if (!/^[0-9+\-\s()]{6,20}$/.test(phone)) return setError("The phone number looks incorrect.");
    if (form.pincode && form.pincode.length !== 6) return setError("PIN code must be 6 digits.");
    if (form.gstin && !isValidGstin(form.gstin)) return setError("Enter a valid 15-character GSTIN, or leave it blank.");
    onSave({ ...form, id: form.id || uid(), name, phone });
  };

  return (
    <Modal title={editing ? `Edit ${customer.name}` : "New Customer"} onClose={onClose} className="profile-modal">
      <form className="profile-form" onSubmit={submit} noValidate>
        <div className="form-row">
          <label>
            Customer name *
            <input
              value={form.name}
              maxLength={160}
              autoFocus
              placeholder="e.g. Ravi Kumar / XYZ Corp"
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>
          <label>
            Phone number *
            <input
              value={form.phone}
              type="tel"
              placeholder="Mobile number"
              onChange={(e) => setField("phone", e.target.value)}
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
        </div>

        {error ? (
          <div className="form-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <div className="register-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {editing ? "Save Changes" : "Save Customer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { stateName } from "../lib/invoice";
import BusinessForm from "./BusinessForm";
import CustomerForm from "./CustomerForm";
import { byName, upsertById } from "./gstData";
import Picker from "./Picker";
import { ConfirmDialog } from "./ui";

const place = (p) => [p.city, stateName(p.state)].filter(Boolean).join(", ");

export function BusinessPicker({ businesses, selectedId, disabled, invalid, onSelect, onSaveList, onSaved, notify }) {
  const [form, setForm] = useState(null);

  const handleSaved = (profile) => {
    const isNew = !businesses.some((b) => b.id === profile.id);
    try {
      onSaveList(upsertById(businesses, profile).sort(byName));
    } catch (e) {
      notify(e.message, "error");
      return;
    }
    setForm(null);
    onSaved?.(profile, isNew);
    notify(isNew ? `Registered ${profile.name}.` : `Updated ${profile.name}.`);
  };

  return (
    <>
      <Picker
        label="Business"
        items={businesses}
        selectedId={selectedId}
        placeholder={businesses.length ? "Select business…" : "No business registered yet"}
        searchPlaceholder="Search business name"
        newLabel="+ New Register"
        describe={(b) => [b.gstin, place(b)].filter(Boolean).join(" · ")}
        onSelect={onSelect}
        onNew={() => setForm({})}
        onEdit={(b) => setForm({ profile: b })}
        disabled={disabled}
        disabledNote="The invoice number is issued, so this bill's business is fixed."
        invalid={invalid}
      />
      {form ? (
        <BusinessForm
          profile={form.profile}
          businesses={businesses}
          onSaved={handleSaved}
          onClose={() => setForm(null)}
        />
      ) : null}
    </>
  );
}

export function CustomerPicker({ clients, selectedId, onSelect, onClear, onSaveList, onSaved, onDeleted, notify }) {
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const handleSaved = (customer) => {
    const isNew = !clients.some((c) => c.id === customer.id);
    try {
      onSaveList(upsertById(clients, customer).sort(byName));
    } catch (e) {
      notify(e.message, "error");
      return;
    }
    setForm(null);
    onSaved?.(customer, isNew);
    notify(isNew ? `Saved customer ${customer.name}.` : `Updated customer ${customer.name}.`);
  };

  const handleDelete = () => {
    try {
      onSaveList(clients.filter((c) => c.id !== deleting.id));
    } catch (e) {
      notify(e.message, "error");
      return;
    }
    onDeleted?.(deleting);
    notify(`Deleted customer ${deleting.name}.`);
    setDeleting(null);
  };

  return (
    <>
      <Picker
        label="Customer"
        items={clients}
        selectedId={selectedId}
        placeholder={clients.length ? "Select saved customer…" : "No saved customers yet"}
        searchPlaceholder="Search customer name or phone"
        newLabel="+ New"
        describe={(c) => [c.phone, place(c)].filter(Boolean).join(" · ")}
        onSelect={onSelect}
        onClear={onClear}
        onNew={() => setForm({})}
        onEdit={(c) => setForm({ customer: c })}
        onDelete={setDeleting}
      />
      {form ? <CustomerForm customer={form.customer} onSave={handleSaved} onClose={() => setForm(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete customer?"
          message={`${deleting.name} will be removed from your saved customers. Bills already saved for them are not changed.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}

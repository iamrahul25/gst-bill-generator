"use client";

import { useCallback, useEffect, useState } from "react";
import * as store from "../lib/storage";

const SAVERS = {
  businesses: store.saveGstBusinesses,
  clients: store.saveClients,
  bills: store.saveGstBills,
};

// Registered businesses, saved customers and saved GST bills from this
// browser. `save(key, list)` writes one of them and throws when storage is full.
export function useGstData() {
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(store.loadGst());
  }, []);

  const save = useCallback((key, list) => {
    SAVERS[key](list);
    setData((d) => ({ ...d, [key]: list }));
  }, []);

  return [data, save];
}

export const byName = (a, b) => a.name.localeCompare(b.name);

export function upsertById(list, item) {
  const exists = list.some((x) => x.id === item.id);
  return exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

// Newest invoice date first; bills of the same day by number.
export const byInvoiceDate = (a, b) =>
  (b.data.date || "").localeCompare(a.data.date || "") || b.number.localeCompare(a.number, "en", { numeric: true });

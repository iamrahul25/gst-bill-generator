import { Suspense } from "react";
import SavedBills from "../components/SavedBills";

export const metadata = { title: "Saved Bills · GST Bill Generator" };

export default function BillsPage() {
  return (
    <Suspense fallback={<div className="loading">Loading…</div>}>
      <SavedBills />
    </Suspense>
  );
}

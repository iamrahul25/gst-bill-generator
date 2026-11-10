import CancelBill from "../../../components/CancelBill";

export const metadata = { title: "Cancel Bill · GST Bill Generator" };

export default async function CancelBillPage({ params }) {
  const { id } = await params;
  return <CancelBill id={id} />;
}

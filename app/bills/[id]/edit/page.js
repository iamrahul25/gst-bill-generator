import EditBill from "../../../components/EditBill";

export const metadata = { title: "Edit Bill · GST Bill Generator" };

export default async function EditBillPage({ params }) {
  const { id } = await params;
  return <EditBill id={id} />;
}

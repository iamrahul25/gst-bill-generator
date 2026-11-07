import "./globals.css";

export const metadata = {
  title: "GST Bill Generator",
  description: "Create and print GST and non-GST invoices",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

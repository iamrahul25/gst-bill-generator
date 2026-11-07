import "./globals.css";

export const metadata = {
  title: "GST Bill Generator",
  description: "Create and print GST and non-GST invoices",
  applicationName: "GST Bill Generator",
  appleWebApp: { capable: true, title: "GST Bills", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#1e3a8a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

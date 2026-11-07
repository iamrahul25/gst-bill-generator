export default function manifest() {
  return {
    name: "GST Bill Generator",
    short_name: "GST Bills",
    description: "Create and print GST and non-GST invoices",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#1e3a8a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

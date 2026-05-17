import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeamMamba — Work OS",
    short_name: "TeamMamba",
    description: "The collaborative work management platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0f0f11",
    theme_color: "#6c5ce7",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["productivity", "business"],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Home",
        url: "/dashboard",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Boards",
        short_name: "Boards",
        url: "/workspaces",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Notifications",
        short_name: "Alerts",
        url: "/notifications",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}

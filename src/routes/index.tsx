import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sendra Admin 2.0 — Subscription Management" },
      { name: "description", content: "Manage Sendra clients, plans, subscriptions and daily usage." },
      { property: "og:title", content: "Sendra Admin 2.0 — Subscription Management" },
      { property: "og:description", content: "Manage Sendra clients, plans, subscriptions and daily usage." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { json, publicClient } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/plans")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await publicClient().rpc("api_get_plans");
        if (error) { console.error(error); return json({ error: "Unavailable" }, 500); }
        return json({ plans: data });
      },
    },
  },
});

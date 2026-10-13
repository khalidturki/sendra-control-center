import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, userClient } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const inst = new URL(request.url).searchParams.get("installation_id") ?? "";
        const { data, error } = await userClient(token).rpc("customer_status", { _installation_id: inst.slice(0, 200) });
        return error ? dbError(error) : json(data);
      },
    },
  },
});

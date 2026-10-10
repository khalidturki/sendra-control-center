import { createFileRoute } from "@tanstack/react-router";
import { json, publicClient, readBody, str } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = await readBody(request);
        const id = str(b?.client_id, 40), key = str(b?.api_key, 100);
        if (!id || !key) return json({ allowed: false, reason: "INVALID_REQUEST" }, 400);
        const { data, error } = await publicClient().rpc("api_check_subscription", { _client_code: id, _api_key: key });
        if (error) { console.error(error); return json({ error: "Unavailable" }, 500); }
        const r = data as { reason?: string };
        return json(data, r.reason === "INVALID_CREDENTIALS" ? 401 : 200);
      },
    },
  },
});

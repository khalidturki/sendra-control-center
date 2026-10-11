import { createFileRoute } from "@tanstack/react-router";
import { json, publicClient, readBody, str } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/usage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = await readBody(request);
        const id = str(b?.["client_id"], 40), key = str(b?.["api_key"], 100), tx = str(b?.["transaction_id"], 200), status = str(b?.["status"], 20);
        if (!id || !key || !tx || !status) return json({ counted: false, reason: "INVALID_REQUEST" }, 400);
        const { data, error } = await publicClient().rpc("api_record_transaction", { _client_code: id, _api_key: key, _transaction_id: tx, _status: status });
        if (error) { console.error(error); return json({ error: "Unavailable" }, 500); }
        const r = data as { reason?: string };
        return json(data, r.reason === "INVALID_CREDENTIALS" ? 401 : 200);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, publicClient, readBody, str, userClient } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/usage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = await readBody(request);
        const tx = str(b?.["transaction_id"], 200), status = str(b?.["status"], 20);
        const token = bearer(request);
        if (token) {
          const inst = str(b?.["installation_id"], 200);
          if (!inst || !tx || !status) return json({ counted: false, reason: "INVALID_REQUEST" }, 400);
          const { data, error } = await userClient(token).rpc("customer_record_transaction", { _installation_id: inst, _transaction_id: tx, _status: status });
          return error ? dbError(error) : json(data);
        }
        const id = str(b?.["client_id"], 40), key = str(b?.["api_key"], 100);
        if (!id || !key || !tx || !status) return json({ counted: false, reason: "INVALID_REQUEST" }, 400);
        const { data, error } = await publicClient().rpc("api_record_transaction", { _client_code: id, _api_key: key, _transaction_id: tx, _status: status });
        if (error) { console.error(error); return json({ error: "Unavailable" }, 500); }
        const r = data as { reason?: string };
        return json(data, r.reason === "INVALID_CREDENTIALS" ? 401 : 200);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, readBody, str, userClient } from "@/lib/public-api.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/transactions/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const body = await readBody(request);
        const reservationId = str(body?.["reservation_id"], 36);
        const outcome = str(body?.["outcome"], 20)?.toUpperCase();
        if (
          !reservationId ||
          !UUID_RE.test(reservationId) ||
          !outcome ||
          !["DIALED", "NOT_DIALED", "SUCCESS", "FAILED", "UNKNOWN"].includes(outcome)
        ) {
          return json({ finalized: false, reason: "INVALID_REQUEST" }, 400);
        }

        const { data, error } = await userClient(token).rpc("admin_reconcile_transaction", {
          _reservation_id: reservationId,
          _outcome: outcome,
        });
        if (error) return dbError(error);
        const result = data as { finalized?: boolean; reason?: string };
        return json(data, result.finalized ? 200 : 409);
      },
    },
  },
});

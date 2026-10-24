import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, readBody, str, userClient } from "@/lib/public-api.server";

const HASHED_TRANSACTION_ID_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/transactions/finalize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const body = await readBody(request);
        const installationId = str(body?.["installation_id"], 200);
        const reservationId = str(body?.["reservation_id"], 36);
        const transactionId = str(body?.["transaction_id"], 64);
        const outcome = str(body?.["outcome"], 20)?.toUpperCase();
        if (
          !installationId ||
          installationId.length < 8 ||
          !reservationId ||
          !UUID_RE.test(reservationId) ||
          !transactionId ||
          !HASHED_TRANSACTION_ID_RE.test(transactionId) ||
          !outcome ||
          !["DIALED", "NOT_DIALED", "SUCCESS", "FAILED", "UNKNOWN"].includes(outcome)
        ) {
          return json({ finalized: false, reason: "INVALID_REQUEST" }, 400);
        }

        const { data, error } = await userClient(token).rpc("customer_finalize_transaction", {
          _installation_id: installationId,
          _reservation_id: reservationId,
          _transaction_id: transactionId,
          _outcome: outcome,
        });
        if (error) return dbError(error);
        const result = data as { finalized?: boolean; reason?: string };
        const status = result.finalized ? 200 : result.reason === "OUTCOME_UNKNOWN" ? 202 : 409;
        return json(data, status);
      },
    },
  },
});

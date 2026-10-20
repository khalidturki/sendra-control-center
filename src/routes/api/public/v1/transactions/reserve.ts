import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, readBody, str, userClient } from "@/lib/public-api.server";

const HASHED_TRANSACTION_ID_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/transactions/reserve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const body = await readBody(request);
        const installationId = str(body?.["installation_id"], 200);
        const transactionId = str(body?.["transaction_id"], 64);
        const attemptId = str(body?.["attempt_id"], 36);
        if (
          !installationId ||
          installationId.length < 8 ||
          !transactionId ||
          !HASHED_TRANSACTION_ID_RE.test(transactionId) ||
          !attemptId ||
          !UUID_RE.test(attemptId)
        ) {
          return json({ authorized: false, reason: "INVALID_REQUEST" }, 400);
        }

        const { data, error } = await userClient(token).rpc("customer_reserve_transaction", {
          _installation_id: installationId,
          _transaction_id: transactionId,
          _attempt_id: attemptId,
        });
        if (error) return dbError(error);
        const result = data as { authorized?: boolean; reason?: string };
        const status = result.authorized
          ? 200
          : result.reason === "DEVICE_NOT_APPROVED" || result.reason === "NO_ACTIVE_SUBSCRIPTION"
            ? 403
            : result.reason === "DAILY_LIMIT_REACHED" ||
                result.reason === "DUPLICATE_TRANSACTION" ||
                result.reason === "TRANSACTION_ALREADY_RESERVED" ||
                result.reason === "ATTEMPT_ALREADY_USED"
              ? 409
              : 400;
        return json(data, status);
      },
    },
  },
});

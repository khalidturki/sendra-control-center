import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, userClient } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/transactions/pending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
        if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
          return json({ error: "INVALID_LIMIT" }, 400);
        }
        const { data, error } = await userClient(token).rpc(
          "admin_list_pending_transaction_reservations",
          { _limit: requestedLimit },
        );
        if (error) return dbError(error);
        return json({ reservations: data });
      },
    },
  },
});

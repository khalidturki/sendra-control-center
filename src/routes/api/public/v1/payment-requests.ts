import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, readBody, str, userClient } from "@/lib/public-api.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/payment-requests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const b = await readBody(request);
        const plan = str(b?.["plan_id"], 40);
        if (!plan || !UUID.test(plan)) return json({ error: "INVALID_REQUEST" }, 400);
        const { data, error } = await userClient(token).rpc("customer_request_plan", {
          _plan_id: plan,
          _payer_phone: str(b?.["payer_phone"], 30) ?? undefined,
          _reference: str(b?.["reference"], 200) ?? undefined,
        });
        if (error) return dbError(error);
        const r = data as { whatsapp_number: string; whatsapp_message: string };
        const wa = `https://wa.me/${r.whatsapp_number.replace(/\D/g, "")}?text=${encodeURIComponent(r.whatsapp_message)}`;
        return json({ ...r, whatsapp_url: wa }, 201);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { bearer, dbError, json, readBody, str, userClient } from "@/lib/public-api.server";

export const Route = createFileRoute("/api/public/v1/devices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const b = await readBody(request);
        const inst = str(b?.["installation_id"], 200);
        if (!inst || inst.length < 8) return json({ error: "INVALID_REQUEST" }, 400);
        const name = str(b?.["device_name"], 120);
        const { data, error } = await userClient(token).rpc("customer_register_device", { _installation_id: inst, ...(name ? { _device_name: name } : {}) });
        return error ? dbError(error) : json(data);
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { bearer, json } from "@/lib/public-api.server";
import { adminClient } from "@/lib/android-auth.server";

// Revokes the Android session (its refresh token) for this device only.
export const Route = createFileRoute("/api/public/v1/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const admin = await adminClient();
        const { error } = await admin.auth.admin.signOut(token, "local");
        if (error && !/session|jwt|not found/i.test(error.message)) { console.error(error); return json({ error: "Unavailable" }, 500); }
        return json({ ok: true });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { bearer, json, readBody, str } from "@/lib/public-api.server";
import { adminClient, CODE_TTL_SECONDS, expectedRedirect, PKCE_RE, randomCode, sha256b64url } from "@/lib/android-auth.server";

// Called by the customer website after the customer signs in. Issues a one-time code bound to the PKCE challenge.
export const Route = createFileRoute("/api/public/v1/auth/authorize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ error: "UNAUTHORIZED" }, 401);
        const b = await readBody(request);
        const challenge = str(b?.["code_challenge"], 128);
        const method = str(b?.["code_challenge_method"], 10);
        const redirect = str(b?.["redirect_uri"], 300);
        const state = str(b?.["state"], 200);
        if (!challenge || !PKCE_RE.test(challenge) || method !== "S256") return json({ error: "INVALID_PKCE" }, 400);
        if (!state || state.length < 16) return json({ error: "INVALID_STATE" }, 400);
        if (redirect !== expectedRedirect(request)) return json({ error: "INVALID_REDIRECT_URI" }, 400);

        const admin = await adminClient();
        const { data: u, error: ue } = await admin.auth.getUser(token);
        if (ue || !u.user) return json({ error: "UNAUTHORIZED" }, 401);

        await admin.from("auth_handoff_codes").delete().lt("expires_at", new Date(Date.now() - 3600_000).toISOString());
        const code = randomCode();
        const { error } = await admin.from("auth_handoff_codes").insert({
          code_hash: await sha256b64url(code),
          user_id: u.user.id,
          code_challenge: challenge,
          redirect_uri: redirect,
          expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
        });
        if (error) { console.error(error); return json({ error: "Unavailable" }, 500); }
        const url = new URL(redirect);
        url.searchParams.set("code", code);
        url.searchParams.set("state", state);
        return json({ redirect_url: url.toString(), expires_in: CODE_TTL_SECONDS });
      },
    },
  },
});

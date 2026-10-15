import { createFileRoute } from "@tanstack/react-router";
import { json, publicClient, readBody, str } from "@/lib/public-api.server";
import { adminClient, PKCE_RE, sha256b64url } from "@/lib/android-auth.server";

type Session = { access_token: string; refresh_token: string; expires_in: number; expires_at?: number; token_type: string; user: { id: string; email?: string } };
const out = (s: Session) =>
  json({ access_token: s.access_token, refresh_token: s.refresh_token, token_type: "bearer", expires_in: s.expires_in, expires_at: s.expires_at, user: { id: s.user.id, email: s.user.email } });

// Android exchanges the one-time code + PKCE verifier for its own session, or refreshes a session.
export const Route = createFileRoute("/api/public/v1/auth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = await readBody(request);
        const grant = str(b?.["grant_type"], 40);

        if (grant === "refresh_token") {
          const rt = str(b?.["refresh_token"], 500);
          if (!rt) return json({ error: "INVALID_REQUEST" }, 400);
          const { data, error } = await publicClient().auth.refreshSession({ refresh_token: rt });
          if (error || !data.session) return json({ error: "INVALID_GRANT" }, 401);
          return out(data.session);
        }

        if (grant !== "authorization_code") return json({ error: "UNSUPPORTED_GRANT_TYPE" }, 400);
        const code = str(b?.["code"], 100);
        const verifier = str(b?.["code_verifier"], 128);
        const redirect = str(b?.["redirect_uri"], 300);
        if (!code || !verifier || !PKCE_RE.test(verifier) || !redirect) return json({ error: "INVALID_REQUEST" }, 400);

        const admin = await adminClient();
        // Atomically consume: a code works exactly once and only before it expires.
        const { data: row, error: ce } = await admin
          .from("auth_handoff_codes")
          .update({ used_at: new Date().toISOString() })
          .eq("code_hash", await sha256b64url(code))
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .select()
          .maybeSingle();
        if (ce) { console.error(ce); return json({ error: "Unavailable" }, 500); }
        if (!row || row.redirect_uri !== redirect || row.code_challenge !== (await sha256b64url(verifier))) {
          return json({ error: "INVALID_GRANT" }, 400);
        }

        const { data: u } = await admin.auth.admin.getUserById(row.user_id);
        const email = u.user?.email;
        if (!email) return json({ error: "INVALID_GRANT" }, 400);
        const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email });
        if (le || !link.properties?.hashed_token) { console.error(le); return json({ error: "Unavailable" }, 500); }
        const { data: v, error: ve } = await publicClient().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
        if (ve || !v.session) { console.error(ve); return json({ error: "Unavailable" }, 500); }
        return out(v.session);
      },
    },
  },
});

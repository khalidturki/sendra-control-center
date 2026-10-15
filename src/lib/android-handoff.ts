import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// Browser-safe helpers for the Android sign-in handoff on the customer website.
export const handoffSearch = z.object({
  client: z.string().max(20).optional(),
  redirect_uri: z.string().max(300).optional(),
  code_challenge: z.string().max(128).optional(),
  code_challenge_method: z.string().max(10).optional(),
  state: z.string().max(200).optional(),
});
export type Handoff = { redirect_uri: string; code_challenge: string; code_challenge_method: string; state: string };
const KEY = "sendra.android_handoff";

/** Reads the handoff from the URL (and remembers it for signup/reset hops), or from earlier in this tab. */
export function readHandoff(search: z.infer<typeof handoffSearch>): Handoff | null {
  if (search.client === "android" && search.redirect_uri && search.code_challenge && search.state) {
    const h = { redirect_uri: search.redirect_uri, code_challenge: search.code_challenge, code_challenge_method: search.code_challenge_method ?? "S256", state: search.state };
    sessionStorage.setItem(KEY, JSON.stringify(h));
    return h;
  }
  try { const raw = sessionStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Handoff) : null; } catch { return null; }
}
export function handoffParams(h: Handoff | null) {
  return h ? { client: "android", ...h } : {};
}

/** Exchanges the signed-in web session for a one-time code and sends the customer back to the app. */
export async function completeHandoff(h: Handoff) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/public/v1/auth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(h),
  });
  const body = (await res.json().catch(() => ({}))) as { redirect_url?: string; error?: string };
  if (!res.ok || !body.redirect_url) {
    const msg: Record<string, string> = {
      INVALID_REDIRECT_URI: "This sign-in link isn't valid. Go back to the Sendra app and try again.",
      INVALID_PKCE: "This sign-in link isn't valid. Go back to the Sendra app and try again.",
      INVALID_STATE: "This sign-in link isn't valid. Go back to the Sendra app and try again.",
      UNAUTHORIZED: "Your session expired. Please sign in again.",
    };
    throw new Error(msg[body.error ?? ""] ?? "Couldn't return you to the app. Please try again.");
  }
  sessionStorage.removeItem(KEY);
  // The browser session is only a bridge; the app gets its own session from the code.
  await supabase.auth.signOut({ scope: "local" });
  window.location.assign(body.redirect_url);
}

export function authErrorMessage(err: unknown) {
  const m = err instanceof Error ? err.message : String(err ?? "");
  if (/invalid login credentials/i.test(m)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(m)) return "Please confirm your email first — check your inbox for the link.";
  if (/already registered|already exists/i.test(m)) return "An account with this email already exists. Try logging in.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a minute and try again.";
  if (/pwned|leaked|weak/i.test(m)) return "This password is too common. Please choose a stronger one.";
  return m || "Something went wrong. Please try again.";
}

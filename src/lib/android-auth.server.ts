// Server-only helpers for the Android PKCE handoff. Import only from server route handlers.
export const ANDROID_CALLBACK_PATH = "/android/callback";
export const CODE_TTL_SECONDS = 120;

export function expectedRedirect(request: Request) {
  return new URL(ANDROID_CALLBACK_PATH, new URL(request.url).origin).toString();
}

export function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256b64url(input: string) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

export function randomCode() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export const PKCE_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

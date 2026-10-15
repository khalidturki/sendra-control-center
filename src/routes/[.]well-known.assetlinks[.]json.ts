import { createFileRoute } from "@tanstack/react-router";
import { adminClient } from "@/lib/android-auth.server";

// Digital Asset Links file that verifies the Android App Link for /android/callback.
export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await adminClient();
        const { data } = await admin.from("app_settings").select("android_package_name, android_cert_sha256").eq("id", true).maybeSingle();
        const pkg = data?.android_package_name?.trim();
        const fps = (data?.android_cert_sha256 ?? "").split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
        const body = pkg && fps.length
          ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fps } }]
          : [];
        return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
      },
    },
  },
});

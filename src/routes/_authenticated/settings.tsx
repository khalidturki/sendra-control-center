import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errMsg, useInvalidateAll, useSettings } from "@/lib/sendra";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Sendra Admin 2.0" }, { name: "description", content: "Usage timezone, currency, admins and API reference." }, { property: "og:title", content: "Settings — Sendra Admin 2.0" }, { property: "og:description", content: "Usage timezone, currency, admins and API reference." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useSettings();
  const invalidate = useInvalidateAll();
  const [tz, setTz] = useState("");
  const [cur, setCur] = useState("");
  const [pay, setPay] = useState({ payment_recipient: "", ussd_template: "", whatsapp_number: "" });
  const [android, setAndroid] = useState({ android_package_name: "", android_cert_sha256: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings.data) { setTz(settings.data.usage_timezone); setCur(settings.data.currency); setPay({ payment_recipient: settings.data.payment_recipient, ussd_template: settings.data.ussd_template, whatsapp_number: settings.data.whatsapp_number }); setAndroid({ android_package_name: settings.data.android_package_name, android_cert_sha256: settings.data.android_cert_sha256 }); } }, [settings.data]);
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_list_users"); if (error) throw error; return data; },
  });

  async function save() {
    if (!/^[A-Z]{3}$/.test(cur)) return void toast.error("Currency must be a 3-letter code, e.g. USD");
    if (!/^[0-9]{3,20}$/.test(pay.payment_recipient.trim())) return void toast.error("Payment recipient must be digits only");
    if (!pay.ussd_template.includes("AMOUNT")) return void toast.error("USSD template must contain the word AMOUNT");
    if (!/^\+?[0-9]{8,15}$/.test(pay.whatsapp_number.trim())) return void toast.error("WhatsApp number must be in international format, e.g. +252657504834");
    const packageName = android.android_package_name.trim();
    const fingerprints = android.android_cert_sha256.trim().split(/[\s,]+/).filter(Boolean);
    const fingerprintPattern = /^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;
    if (packageName && !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
      return void toast.error("Enter a valid Android package name, e.g. com.sendra.app");
    }
    if ((packageName && fingerprints.length === 0) || (!packageName && fingerprints.length > 0)) {
      return void toast.error("Enter both the Android package name and at least one signing fingerprint");
    }
    if (fingerprints.some((fingerprint) => !fingerprintPattern.test(fingerprint))) {
      return void toast.error("Each Android signing fingerprint must be a 32-byte SHA-256 value");
    }
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({ usage_timezone: tz.trim(), currency: cur, payment_recipient: pay.payment_recipient.trim(), ussd_template: pay.ussd_template.trim(), whatsapp_number: pay.whatsapp_number.trim(), android_package_name: packageName, android_cert_sha256: fingerprints.join(",").toUpperCase() }).eq("id", true);
    setSaving(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("Settings saved"); invalidate();
  }
  async function setAdmin(id: string, grant: boolean) {
    const { error } = await supabase.rpc("admin_set_admin", { _user_id: id, _grant: grant });
    if (error) return void toast.error(errMsg(error));
    toast.success(grant ? "Admin access granted" : "Admin access removed"); users.refetch();
  }
  const base = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Settings" />
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Usage & billing</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">Daily reset timezone (IANA, e.g. Africa/Lagos)</Label><Input value={tz} onChange={(e) => setTz(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Currency</Label><Input value={cur} maxLength={3} onChange={(e) => setCur(e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Payment recipient number</Label><Input value={pay.payment_recipient} onChange={(e) => setPay({ ...pay, payment_recipient: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">USSD template (AMOUNT is replaced by the price)</Label><Input className="font-mono" value={pay.ussd_template} onChange={(e) => setPay({ ...pay, ussd_template: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Admin WhatsApp number</Label><Input value={pay.whatsapp_number} onChange={(e) => setPay({ ...pay, whatsapp_number: e.target.value })} /></div>
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Android App Links</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These values are served at /.well-known/assetlinks.json. Use the package name and SHA-256 signing certificate fingerprint for each app build; separate multiple fingerprints with commas or whitespace.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="android-package-name">Android package name</Label>
            <Input id="android-package-name" value={android.android_package_name} placeholder="com.sendra.app" onChange={(e) => setAndroid({ ...android, android_package_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="android-cert-sha256">Signing certificate SHA-256 fingerprint(s)</Label>
            <Input id="android-cert-sha256" value={android.android_cert_sha256} placeholder="AA:BB:… (32 bytes)" onChange={(e) => setAndroid({ ...android, android_cert_sha256: e.target.value })} />
          </div>
        </div>
        <Button className="mt-4" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Admin access</h3>
        <p className="text-xs text-muted-foreground">People who signed up appear here. Only admins can use the console.</p>
        <ul className="mt-4 divide-y">
          {users.isLoading && <li className="py-3 text-sm text-muted-foreground">Loading…</li>}
          {users.error && <li className="py-3 text-sm text-destructive">{errMsg(users.error)}</li>}
          {users.data?.map((u) => (
            <li key={u.user_id} className="flex items-center justify-between py-3 text-sm">
              <span>{u.email}</span>
              <Switch checked={u.is_admin} onCheckedChange={(v) => setAdmin(u.user_id, v)} />
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border bg-card p-5 text-sm">
        <h3 className="font-semibold">Android API</h3>
        <p className="mt-1 text-xs text-muted-foreground">Customers sign in with their account and send "Authorization: Bearer &lt;access token&gt;". Legacy Client ID + API key still works for verify and usage.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{`GET  ${base}/api/public/v1/plans
GET  ${base}/api/public/v1/me?installation_id=…
POST ${base}/api/public/v1/devices            {"installation_id","device_name"}
POST ${base}/api/public/v1/payment-requests   {"plan_id","payer_phone","reference"}
POST ${base}/api/public/v1/verify             {"installation_id"}
POST ${base}/api/public/v1/usage              {"installation_id","transaction_id","status":"SUCCESS"}`}</pre>
      </section>
    </div>
  );
}

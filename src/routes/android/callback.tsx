import { createFileRoute } from "@tanstack/react-router";
import { CustomerAuthLayout } from "@/components/customer/CustomerAuthLayout";

// Verified Android App Link target. With the app installed, Android opens the app and this page never shows.
export const Route = createFileRoute("/android/callback")({
  head: () => ({
    meta: [
      { title: "Return to the Sendra app" },
      { name: "description", content: "Finish signing in by opening the Sendra Android app." },
      { property: "og:title", content: "Return to the Sendra app" },
      { property: "og:description", content: "Finish signing in by opening the Sendra Android app." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <CustomerAuthLayout title="Open the Sendra app" subtitle="You're signed in. Return to the Sendra app on this phone to continue.">
      <p className="text-sm text-muted-foreground">If the app didn't open, make sure the latest Sendra app is installed, then start the log in again from the app.</p>
    </CustomerAuthLayout>
  ),
});

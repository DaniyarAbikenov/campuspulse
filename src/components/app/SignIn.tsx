import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";
import { DEMO_LOGIN_ENABLED, GOOGLE_CLIENT_ID } from "@/lib/api";
import { loadGoogleIdentity } from "@/lib/google-identity";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export function SignIn() {
  const { locale } = useI18n();
  const { signInWithGoogle, signInDemo } = useStore();
  const button = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let active = true;
    loadGoogleIdentity()
      .then((gis) => {
        if (!active || !button.current) return;
        gis.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            setBusy(true);
            signInWithGoogle(credential)
              .catch((cause: unknown) => setError(String(cause)))
              .finally(() => setBusy(false));
          },
        });
        gis.renderButton(button.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          width: 300,
          locale: locale === "kk" ? "kk" : locale,
        });
      })
      .catch((cause: unknown) => setError(String(cause)));
    return () => {
      active = false;
    };
  }, [locale, signInWithGoogle]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="panel w-full max-w-sm p-6 text-center">
        <div className="mb-4 flex justify-center"><Logo /></div>
        <h1 className="text-[18px] font-semibold">{localize("Sign in to CampusPulse", locale)}</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {localize("CampusPulse reads your planner and course data to organise your coursework. It never submits work on your behalf.", locale)}
        </p>
        <div className="mt-5 flex min-h-11 justify-center">
          {GOOGLE_CLIENT_ID ? (
            <div ref={button} aria-busy={busy} />
          ) : (
            <p role="status" className="text-[12.5px] text-warning">
              {localize("Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID).", locale)}
            </p>
          )}
        </div>
        {error ? (
          <p role="alert" className="mt-3 break-words text-[12px] text-destructive">{error}</p>
        ) : null}
        {DEMO_LOGIN_ENABLED ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-[12px] text-muted-foreground"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              signInDemo()
                .catch(() => setError("Demo sign-in is disabled on this server."))
                .finally(() => setBusy(false));
            }}
          >
            {localize("Continue with the demo account", locale)}
          </Button>
        ) : null}
      </div>
    </main>
  );
}

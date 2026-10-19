import { localize, useI18n } from "@/lib/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider, useStore } from "@/lib/store";
import { workspaceDestination, type WorkspaceRole } from "@/lib/workspace-access";
import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { SignIn } from "@/components/app/SignIn";
import { Onboarding } from "@/components/app/Onboarding";
import { ChatDrawer } from "@/components/app/ChatDrawer";
import { UploadDialog } from "@/components/app/UploadDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageInitialization } from "@/lib/i18n";

function NotFoundComponent() {
  const { locale } = useI18n();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-semibold text-foreground">{localize("404", locale)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{localize("This page doesn't exist in your workspace.", locale)}</p>
        <Link to="/" className="mt-5 inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover">{localize("Back to Overview", locale)}</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { locale } = useI18n();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{localize("This page didn't load", locale)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{localize("Something went wrong. Try refreshing.", locale)}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{localize("Try again", locale)}</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient; workspaceRole?: WorkspaceRole }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CampusPulse AI" },
      { name: "description", content: "AI-powered academic command center for university students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {localize(children, locale)}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { locale } = useI18n();
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageInitialization />
      <StoreProvider onRoleChange={(workspaceRole) => router.update({ context: { ...router.options.context, queryClient, workspaceRole } })}>
        <TooltipProvider delayDuration={200}>
          <AuthGate>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="mx-auto min-w-0 w-full max-w-[1440px] flex-1 px-3 py-4 sm:px-5">
                <ConnectionBanner />
                <WorkspaceContent />
              </main>
            </div>
          </div>
          <ChatDrawer />
          <UploadDialog />
          </AuthGate>
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

/** Shows sign-in or onboarding instead of the workspace until the student is ready. */
function AuthGate({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const { auth, connection } = useStore();
  // Until the account's data has arrived nothing may be drawn: the fixtures belong to offline mode only.
  if (auth === "checking" || (auth === "signed_in" && connection === "connecting")) return <WorkspaceSkeleton label={localize("Loading…", locale)} />;
  if (auth === "signed_out") return <SignIn />;
  if (auth === "needs_onboarding") return <Onboarding />;
  return <>{children}</>;
}

function WorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto max-w-[1440px] space-y-4 p-5">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function ConnectionBanner() {
  const { locale } = useI18n();
  const { connection } = useStore();
  if (connection === "online") return null;
  const offline = connection === "offline";
  return (
    <div
      role={offline ? "alert" : "status"}
      className="mb-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[13px]"
    >
      {localize(
        offline
          ? "Offline demo mode: the CampusPulse API is unavailable, showing sample data. Changes are not saved."
          : "Connecting to the CampusPulse API…",
        locale,
      )}
    </div>
  );
}

function WorkspaceContent() {
  const { locale } = useI18n();
  const { role } = useStore();
  const router = useRouter();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const destination = workspaceDestination(role, path);
  useEffect(() => { if (destination) void router.navigate({ to: destination, replace: true }); }, [destination, router]);
  return destination ? null : <Outlet />;
}

// Google Identity Services: https://developers.google.com/identity/gsi/web
interface GoogleId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: "popup";
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
let loading: Promise<GoogleId> | null = null;

export function loadGoogleIdentity(): Promise<GoogleId> {
  if (window.google) return Promise.resolve(window.google.accounts.id);
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.google ? resolve(window.google.accounts.id) : reject(new Error("GIS unavailable"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not load Google sign-in"));
    };
    document.head.append(script);
  });
  return loading;
}

export const signOutGoogle = () => window.google?.accounts.id.disableAutoSelect();

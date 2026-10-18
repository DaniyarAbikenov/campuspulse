import { localize, useI18n } from "@/lib/i18n";
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  useI18n();
  return (
    <div className={`${className} flex items-center justify-center rounded-md bg-primary text-primary-foreground`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h4l2.5-6 4 12 3-8 1.5 2H22" />
      </svg>
    </div>
  );
}

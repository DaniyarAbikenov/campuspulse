import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { languages, useI18n, type Locale } from "@/lib/i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <Select value={locale} onValueChange={(value) => { if (value === "en" || value === "ru" || value === "kk") setLocale(value as Locale); }}>
    <SelectTrigger id={compact ? "language-topbar" : "interface-language"} aria-label={t("Interface language")} className={compact ? "h-8 w-[70px] shrink-0 px-2 text-xs [&>svg:last-child]:hidden" : "w-full max-w-xs"}>
      {compact ? <><Languages className="size-3.5 shrink-0" /><span>{locale.toUpperCase()}</span></> : <SelectValue />}
    </SelectTrigger>
    <SelectContent>{languages.map((language) => <SelectItem key={language.value} value={language.value} lang={language.value}>{language.label}</SelectItem>)}</SelectContent>
  </Select>;
}
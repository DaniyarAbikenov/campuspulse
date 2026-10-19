import { BookOpen } from "lucide-react";
import type { StudyResource } from "@/lib/data";
import { localize, useI18n } from "@/lib/i18n";

/** Passages from the student's own lectures that help with a task, each with its page. */
export function StudyMaterial({ resources }: { resources: StudyResource[] | undefined }) {
  const { locale } = useI18n();
  if (!resources?.length) return null;
  return (
    <section
      aria-label={localize("Study material", locale)}
      className="rounded-md border border-ai/30 bg-ai-soft/50 px-3 py-2"
    >
      <h3 className="flex items-center gap-1.5 text-[12px] font-medium">
        <BookOpen className="h-3.5 w-3.5 text-ai" aria-hidden />{" "}
        {localize("Study material", locale)}
      </h3>
      <ul className="mt-1 space-y-1.5">
        {resources.map((item) => (
          <li key={`${item.documentId}-${item.page}`} className="text-[12px]">
            <details>
              <summary className="cursor-pointer font-medium">
                {item.documentName} · {localize("p.", locale)} {item.page}
              </summary>
              <blockquote className="mt-1 border-l-2 border-ai/40 pl-2 text-muted-foreground">
                {item.excerpt}
              </blockquote>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

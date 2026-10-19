import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/app/Logo";
import { fetchOnboardingOptions, type OnboardingOptions } from "@/lib/api";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export function Onboarding() {
  const { locale } = useI18n();
  const { completeOnboarding, signOut } = useStore();
  const [options, setOptions] = useState<OnboardingOptions | null>(null);
  const [institutionId, setInstitutionId] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [program, setProgram] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchOnboardingOptions()
      .then((loaded) => {
        setOptions(loaded);
        setInstitutionId(loaded.institutions[0]?.id ?? "");
      })
      .catch((cause: unknown) => setError(String(cause)));
  }, []);

  const institution = options?.institutions.find((item) => item.id === institutionId);
  const toggle = (id: string) =>
    setCourseIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    completeOnboarding({ institutionId, studentNumber: studentNumber.trim(), program: program.trim(), courseIds })
      .catch((cause: unknown) => setError(String(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <form onSubmit={submit} className="panel w-full max-w-lg space-y-4 p-6">
        <div className="flex justify-center"><Logo /></div>
        <div className="text-center">
          <h1 className="text-[18px] font-semibold">{localize("Set up your workspace", locale)}</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {localize("Choose your university and the courses you are taking. You can import more from Moodle later.", locale)}
          </p>
        </div>
        <label className="block text-[12.5px]">
          {localize("University", locale)}
          <select
            className="mt-1 w-full rounded-md border bg-background px-2 py-2"
            value={institutionId}
            onChange={(event) => { setInstitutionId(event.target.value); setCourseIds([]); }}
            required
          >
            {options?.institutions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px]">
            {localize("Student number", locale)}
            <Input className="mt-1" value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} required maxLength={64} />
          </label>
          <label className="block text-[12.5px]">
            {localize("Program", locale)}
            <Input className="mt-1" value={program} onChange={(event) => setProgram(event.target.value)} required maxLength={200} />
          </label>
        </div>
        <fieldset>
          <legend className="text-[12.5px]">{localize("Courses", locale)}</legend>
          <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {institution?.courses.length ? (
              institution.courses.map((course) => (
                <label key={course.id} className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={courseIds.includes(course.id)} onChange={() => toggle(course.id)} />
                  <span className="font-medium">{course.code}</span> {course.name}
                </label>
              ))
            ) : (
              <p className="text-[12px] text-muted-foreground">{localize("No courses are published for this university yet.", locale)}</p>
            )}
          </div>
        </fieldset>
        {error ? <p role="alert" className="break-words text-[12px] text-destructive">{error}</p> : null}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>{localize("Sign out", locale)}</Button>
          <Button type="submit" disabled={busy || !institutionId}>{localize("Continue", locale)}</Button>
        </div>
      </form>
    </main>
  );
}

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All demo data lives in `src/lib/data.ts` and shared state in `src/lib/store.tsx` (React context) — prototype is frontend-only, no backend.
- App shell (sidebar, topbar, chat drawer, upload dialog) is mounted in `src/routes/__root.tsx` — every page shares it.
- Recharts colors come from `src/lib/chartColors.ts` — SVG attributes can't resolve CSS variables.

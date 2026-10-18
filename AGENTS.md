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
- Workspace access uses per-route guards plus an outlet gate, with role carried in router context; this separates demo workspaces without implying production authorization.
- Administrator views read cohort entities from the shared demo-data module, never personal student progress.
- Mobile navigation uses the shared Sidebar inside a Sheet; wide tables and boards scroll inside constrained content containers.
- Document and workload totals are derived in the shared data module; applying a workload plan redistributes daily hours without changing weekly capacity.

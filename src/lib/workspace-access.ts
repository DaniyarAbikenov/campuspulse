import { redirect } from "@tanstack/react-router";

export type WorkspaceRole = "student" | "admin";

export function workspaceDestination(role: WorkspaceRole, path: string): "/" | "/admin" | "/admin/courses" | "/admin/statistics" | null {
  const adminPath = path === "/admin" || path.startsWith("/admin/");
  if (role === "student") return adminPath ? "/" : null;
  if (adminPath || path === "/settings" || path === "/activity") return null;
  if (path === "/courses" || path.startsWith("/courses/")) return "/admin/courses";
  if (path === "/statistics") return "/admin/statistics";
  return "/admin";
}

export function guardWorkspace({ context, location }: { context: { workspaceRole?: WorkspaceRole }; location: { pathname: string } }) {
  const to = workspaceDestination(context.workspaceRole ?? "student", location.pathname);
  if (to) throw redirect({ to });
}
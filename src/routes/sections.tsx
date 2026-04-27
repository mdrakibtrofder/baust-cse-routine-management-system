import { createFileRoute } from "@tanstack/react-router";
import { SectionsPage } from "@/features/sections/SectionsPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/sections")({
  head: () => ({ meta: [{ title: "Sections · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <SectionsPage />
    </AppShell>
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import { CoursesPage } from "@/features/courses/CoursesPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [{ title: "Courses · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CoursesPage />
    </AppShell>
  ),
});

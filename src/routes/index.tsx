import { createFileRoute } from "@tanstack/react-router";
import { CourseLoadPage } from "@/features/course-load/CourseLoadPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  component: () => (
    <AppShell>
      <CourseLoadPage />
    </AppShell>
  ),
});

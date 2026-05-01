import { createFileRoute } from "@tanstack/react-router";
import { AvailabilityFinderPage } from "@/features/availability/AvailabilityFinderPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/availability")({
  head: () => ({ meta: [{ title: "Teacher Availability · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <AvailabilityFinderPage />
    </AppShell>
  ),
});

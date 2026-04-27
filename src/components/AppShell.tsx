import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/AppLayout";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppLayout>{children}</AppLayout>
      <Toaster richColors position="top-right" />
    </>
  );
}

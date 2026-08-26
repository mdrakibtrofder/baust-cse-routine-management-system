import { cn } from "@/lib/utils";

/** Shared inline "open details" affordance used across list tables
 *  (teachers, rooms, sections, courses). Renders text that looks like
 *  plain table content until hovered, then reads as a link. */
export function LinkButton({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer",
        className,
      )}
    >
      {children}
    </button>
  );
}

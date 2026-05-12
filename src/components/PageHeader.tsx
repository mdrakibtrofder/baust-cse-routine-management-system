import { Upload, Download, RotateCcw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { readExcelFile } from "@/lib/excel";
import { utils, writeFileXLSX } from "xlsx";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { RoutineGeneratorDialog } from "./RoutineGeneratorDialog";

interface Props {
  title: string;
  subtitle?: string;
  onImport?: (rows: Record<string, any>[]) => void;
  exportRows?: () => Record<string, any>[];
  exportName?: string;
  showReset?: boolean;
  rightSlot?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  onImport,
  exportRows,
  exportName = "export.xlsx",
  showReset,
  rightSlot,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const reset = useStore((s) => s.resetToSeed);
  const confirmDialog = useConfirm();
  const [genOpen, setGenOpen] = useState(false);

  return (
    <div
      className="border-b bg-card"
      style={{ background: "var(--gradient-soft)" }}
    >
      <div className="px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rightSlot}
          {onImport && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const rows = await readExcelFile(f);
                    onImport(rows);
                    toast.success(`Imported ${rows.length} rows`);
                  } catch (err) {
                    toast.error("Failed to read file");
                  }
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Import Excel
              </Button>
            </>
          )}
          {exportRows && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = exportRows();
                const ws = utils.json_to_sheet(rows);
                const wb = utils.book_new();
                utils.book_append_sheet(wb, ws, "Sheet1");
                writeFileXLSX(wb, exportName);
              }}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
          )}
          {showReset && (
            <Button
              variant="default"
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={() => setGenOpen(true)}
            >
              <Play className="h-4 w-4 mr-1.5 fill-current" />
              Generate Routine
            </Button>
          )}
        </div>
      </div>
      <RoutineGeneratorDialog open={genOpen} onOpenChange={setGenOpen} />
    </div>
  );
}

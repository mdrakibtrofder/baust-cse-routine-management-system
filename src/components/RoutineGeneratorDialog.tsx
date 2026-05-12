import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  Terminal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoutineGeneratorDialog({ open, onOpenChange }: Props) {
  const store = useStore();
  const [status, setStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    const res = await store.getRoutineGenerationStatus();
    if (res) {
      setStatus(res);
      if (res.status === "RUNNING" || res.status === "PAUSED") {
        setIsPolling(true);
      } else {
        setIsPolling(false);
        if (res.status === "COMPLETED") {
          store.init(); // Refresh data
        }
      }
    }
  };

  useEffect(() => {
    if (open) {
      fetchStatus();
    }
  }, [open]);

  useEffect(() => {
    let interval: any;
    if (isPolling && open) {
      interval = setInterval(fetchStatus, 1000);
    }
    return () => clearInterval(interval);
  }, [isPolling, open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [status?.logs]);

  const handleStart = async () => {
    await store.startRoutineGeneration();
    setIsPolling(true);
    toast.info("Routine generation started");
  };

  const handlePause = async () => {
    await store.pauseRoutineGeneration();
    fetchStatus();
  };

  const handleResume = async () => {
    await store.resumeRoutineGeneration();
    fetchStatus();
  };

  const handleStop = async () => {
    await store.stopRoutineGeneration();
    fetchStatus();
  };

  const progress = status?.totalSlots > 0 
    ? Math.round((status.generatedSlots / status.totalSlots) * 100) 
    : 0;

  const isRunning = status?.status === "RUNNING";
  const isPaused = status?.status === "PAUSED";
  const isCompleted = status?.status === "COMPLETED";
  const isFailed = status?.status === "FAILED";
  const isStopped = status?.status === "STOPPED";
  const isIdle = !status || status.status === "IDLE";

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if ((isRunning || isPaused) && !v) {
        toast.warning("Cannot close while generation is in progress");
        return;
      }
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-[600px] h-[600px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className={cn("h-5 w-5", isRunning && "animate-spin text-primary")} />
            Automated Routine Generation
          </DialogTitle>
          <DialogDescription>
            Generate conflict-free routine based on current course load and constraints.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-6 space-y-4">
          {/* Progress Section */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                {isCompleted && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {isFailed && <AlertCircle className="h-4 w-4 text-destructive" />}
                {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                Status: {status?.status || "Ready"}
              </span>
              <span>{status?.generatedSlots || 0} / {status?.totalSlots || 0} slots</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Logs Section */}
          <div className="flex-1 min-h-0 flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <Terminal className="h-3 w-3" />
                Execution Logs
              </div>
              {isCompleted && (
                <div className="text-[10px] font-bold text-emerald-600 animate-pulse">
                  Success Rate: {status.report?.successRate?.toFixed(1)}%
                </div>
              )}
            </div>
            <div className="flex-1 bg-slate-950 rounded-lg p-3 font-mono text-[10px] overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 h-full" ref={scrollRef}>
                <div className="space-y-1">
                  {status?.logs?.map((log: string, i: number) => (
                    <div key={i} className={cn(
                      "break-all",
                      log.includes("FAILED") || log.includes("ERROR") || log.includes("SKIPPING") ? "text-rose-400" : "text-emerald-400/90"
                    )}>
                      {log}
                    </div>
                  ))}
                  {isIdle && <div className="text-slate-500">Waiting to start...</div>}
                  {isRunning && <div className="text-primary animate-pulse">_</div>}
                  
                  {isCompleted && status.report && (
                    <div className="mt-4 pt-4 border-t border-slate-800 text-slate-300 space-y-1">
                      <div className="text-emerald-400 font-bold">--- EXECUTION REPORT ---</div>
                      <div>Total Slots Attempted: {status.report.totalAttempted}</div>
                      <div>Successful Assignments: {status.report.successful}</div>
                      <div>Failed Assignments: {status.report.failed}</div>
                      <div>Success Rate: {status.report.successRate.toFixed(2)}%</div>
                      {status.report.conflictsEncountered.length > 0 && (
                        <>
                          <div className="text-rose-400 mt-2 font-bold">Conflicts Encountered:</div>
                          {status.report.conflictsEncountered.map((c: string, idx: number) => (
                            <div key={idx} className="text-rose-300/70 ml-2">- {c}</div>
                          ))}
                        </>
                      )}
                      <div className="text-emerald-400 font-bold">--- END OF REPORT ---</div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-2 bg-muted/30 border-t flex items-center justify-between sm:justify-between">
          <div className="flex gap-2">
            {isIdle || isCompleted || isStopped || isFailed ? (
              <Button onClick={handleStart} size="sm" className="gap-2">
                <Play className="h-4 w-4" /> {isIdle ? "Start Generation" : "Restart"}
              </Button>
            ) : (
              <>
                {isRunning ? (
                  <Button onClick={handlePause} variant="outline" size="sm" className="gap-2">
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                ) : (
                  <Button onClick={handleResume} variant="outline" size="sm" className="gap-2">
                    <Play className="h-4 w-4" /> Restart
                  </Button>
                )}
                <Button onClick={handleStop} variant="destructive" size="sm" className="gap-2">
                  <Square className="h-4 w-4" /> Stop
                </Button>
              </>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onOpenChange(false)}
            disabled={isRunning || isPaused}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

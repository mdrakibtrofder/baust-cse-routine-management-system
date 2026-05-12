import { useState, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
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
  Terminal,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export function RoutineGeneratorPage() {
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
    fetchStatus();
  }, []);

  useEffect(() => {
    let interval: any;
    if (isPolling) {
      interval = setInterval(fetchStatus, 1000);
    }
    return () => clearInterval(interval);
  }, [isPolling]);

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
    <div className="flex flex-col h-screen bg-background">
      <PageHeader 
        title="Automated Routine Generation" 
        subtitle="Full generation process monitor"
        rightSlot={
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Button>
          </Link>
        }
      />
      
      <div className="flex-1 p-4 sm:p-6 overflow-hidden flex flex-col gap-6 max-w-5xl mx-auto w-full">
        {/* Progress Card */}
        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold flex items-center gap-2">
                {isRunning && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                {isCompleted && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                {isFailed && <AlertCircle className="h-5 w-5 text-destructive" />}
                Routine Generation Status: <span className={cn(
                  "px-2 py-0.5 rounded text-sm uppercase tracking-wider",
                  isRunning && "bg-blue-100 text-blue-700",
                  isPaused && "bg-amber-100 text-amber-700",
                  isCompleted && "bg-emerald-100 text-emerald-700",
                  isFailed && "bg-rose-100 text-rose-700",
                  isStopped && "bg-slate-100 text-slate-700",
                  isIdle && "bg-muted text-muted-foreground"
                )}>{status?.status || "Ready"}</span>
              </h3>
              <p className="text-sm text-muted-foreground">
                Processing {status?.totalSlots || 0} classes across all sections and teachers.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {isIdle || isCompleted || isStopped || isFailed ? (
                <Button onClick={handleStart} className="gap-2 px-6">
                  <Play className="h-4 w-4 fill-current" /> {isIdle ? "Start Generation" : "Restart"}
                </Button>
              ) : (
                <>
                  {isRunning ? (
                    <Button onClick={handlePause} variant="outline" className="gap-2">
                      <Pause className="h-4 w-4 fill-current" /> Pause
                    </Button>
                  ) : (
                    <Button onClick={handleResume} variant="outline" className="gap-2">
                      <Play className="h-4 w-4 fill-current" /> Resume
                    </Button>
                  )}
                  <Button onClick={handleStop} variant="destructive" className="gap-2">
                    <Square className="h-4 w-4 fill-current" /> Stop
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm font-mono">
              <span className="font-bold">{progress}% Completed</span>
              <span className="text-muted-foreground">{status?.generatedSlots || 0} / {status?.totalSlots || 0} Slots</span>
            </div>
            <Progress value={progress} className="h-3 shadow-inner" />
          </div>
        </div>

        {/* Logs & Report Section */}
        <div className="flex-1 min-h-0 grid md:grid-cols-[1fr_300px] gap-6 overflow-hidden">
          {/* Execution Logs */}
          <div className="flex flex-col space-y-2 overflow-hidden">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest px-1">
              <Terminal className="h-3 w-3" />
              Real-time Execution Logs
            </div>
            <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 shadow-2xl p-4 font-mono text-[11px] overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 h-full" ref={scrollRef}>
                <div className="space-y-1.5">
                  {status?.logs?.map((log: string, i: number) => (
                    <div key={i} className={cn(
                      "border-l-2 pl-3 py-0.5",
                      log.includes("FAILED") || log.includes("ERROR") || log.includes("SKIPPING") 
                        ? "border-rose-500 text-rose-300 bg-rose-500/5" 
                        : "border-emerald-500/50 text-emerald-300/90 hover:bg-emerald-500/5 transition-colors"
                    )}>
                      {log}
                    </div>
                  ))}
                  {isIdle && <div className="text-slate-500 italic">Waiting for command to begin routine generation...</div>}
                  {isRunning && <div className="text-primary animate-pulse ml-3">▋</div>}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Completion Report */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest px-1">
              <CheckCircle2 className="h-3 w-3" />
              Generation Report
            </div>
            <div className="flex-1 bg-card rounded-xl border shadow-sm p-5 space-y-6 overflow-auto">
              {status?.report ? (
                <>
                  <div className="space-y-4">
                    <div className="text-center p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="text-3xl font-black text-emerald-600">
                        {status.report.successRate.toFixed(1)}%
                      </div>
                      <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Success Rate</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/50 p-2 rounded border text-center">
                        <div className="text-sm font-bold">{status.report.totalAttempted}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">Attempted</div>
                      </div>
                      <div className="bg-muted/50 p-2 rounded border text-center">
                        <div className="text-sm font-bold text-emerald-600">{status.report.successful}</div>
                        <div className="text-[9px] text-muted-foreground uppercase">Successful</div>
                      </div>
                    </div>
                  </div>

                  {status.report.conflictsEncountered.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Conflicts ({status.report.failed})</div>
                      <div className="space-y-1">
                        {status.report.conflictsEncountered.map((c: string, idx: number) => (
                          <div key={idx} className="text-[10px] bg-rose-50 text-rose-700 p-2 rounded border border-rose-100 leading-tight">
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-3 opacity-50">
                  <div className="p-3 bg-muted rounded-full">
                    <RotateCcw className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="text-xs font-medium">Final report will appear here after completion</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

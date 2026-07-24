import { useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Course, WeekPattern } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
import {
  roomUnavailableAt,
  teacherUnavailableAt,
  teachersBusyAt,
  timesOverlap,
  weeksOverlap,
} from "@/lib/conflicts";
import { cn, compareTimeValues, fmtRange12, roomSupportsKind } from "@/lib/utils";
import { roomAllowedForCourse } from "@/lib/room-dept";
import { useConfirm } from "@/components/ConfirmDialog";

export interface MeetingLike {
  day: string;
  start: string;
  end: string;
  week: WeekPattern;
}

/** Identifies the entity currently being edited so its own persisted meetings
 *  never show up as a conflict with themselves. Pass `lab_section_id` when
 *  editing a lab section, or `section_id` when editing a regular section. */
export interface RoomGridIgnoreEntity {
  section_id?: string | null;
  lab_section_id?: string | null;
}

/** Another entity open in the same modal session (only relevant when a modal
 *  manages more than one schedulable entity at once, i.e. multiple lab
 *  sections) whose in-progress (possibly unsaved) meetings should still count
 *  as booked/busy so two entities being edited side-by-side don't collide. */
export interface OpenEntityDraft {
  label: string;
  teacherIds: string[];
  meetings: MeetingLike[];
}

/** Inline room × period grid for a given day, shared by the regular
 * class-assignment flow and the lab-section flow. Highlights the
 * currently-selected room/period with a ring. Busy/conflicting cells are
 * still selectable (with a confirmation warning) so users can intentionally
 * accept conflicts. */
export function RoomDayGrid({
  course,
  teacherIds,
  day,
  includeOtherDeptRooms = false,
  currentSlotId,
  currentRoomId,
  currentStart,
  currentEnd,
  siblingDrafts = [],
  week,
  onPick,
  totalStudents,
  ignoreEntity,
  otherOpenEntityDrafts = [],
}: {
  course: Course;
  teacherIds: string[];
  day: string;
  includeOtherDeptRooms?: boolean;
  currentSlotId?: string;
  currentRoomId?: string | null;
  currentStart?: string;
  currentEnd?: string;
  siblingDrafts?: MeetingLike[];
  week: WeekPattern;
  onPick: (roomId: string, start: string, end: string) => void;
  totalStudents: number;
  ignoreEntity: RoomGridIgnoreEntity;
  otherOpenEntityDrafts?: OpenEntityDraft[];
}) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const confirmDialog = useConfirm();

  const isOwnSlot = (slotCourseId: string, slotSectionId: string | null | undefined, slotLabSectionId: string | null | undefined) => {
    if (ignoreEntity.lab_section_id) return slotLabSectionId === ignoreEntity.lab_section_id;
    if (ignoreEntity.section_id) return slotCourseId === course.id && slotSectionId === ignoreEntity.section_id;
    return false;
  };

  const rooms = data.rooms
    .filter((r) => roomSupportsKind(r.room_type, info.roomKind))
    .filter((r) => r.capacity >= totalStudents)
    .filter((r) => includeOtherDeptRooms || roomAllowedForCourse(r, course, data.departments))
    .sort((a, b) => a.name.localeCompare(b.name));

  const periods = data.periods
    .filter((p) => p.kind === info.roomKind && !p.is_break)
    .sort((a, b) => compareTimeValues(a.start, b.start));

  const teacherStatusByPeriod = useMemo(() => {
    const map = new Map<
      string,
      {
        busy?: { teacherId: string; teacherShort?: string; teacherName?: string; courseCode?: string; sectionName?: string };
        unavailable?: { teacherId: string; teacherShort?: string; teacherName?: string; reason?: string };
      }
    >();
    for (const p of periods) {
      const entry: {
        busy?: { teacherId: string; teacherShort?: string; teacherName?: string; courseCode?: string; sectionName?: string };
        unavailable?: { teacherId: string; teacherShort?: string; teacherName?: string; reason?: string };
      } = {};

      // First check other entities open in this same modal session (their
      // meetings may not be saved yet, so they won't show up in class_slots).
      for (const otherDraft of otherOpenEntityDrafts) {
        for (const meeting of otherDraft.meetings) {
          if (meeting.day !== day) continue;
          if (!timesOverlap(meeting.start, meeting.end, p.start, p.end)) continue;
          if (!weeksOverlap(meeting.week, week)) continue;
          const clashingTid = otherDraft.teacherIds.find((tid) => teacherIds.includes(tid));
          if (clashingTid) {
            const t = data.teachers.find((x) => x.id === clashingTid);
            entry.busy = {
              teacherId: clashingTid,
              teacherShort: t?.short_name,
              teacherName: t?.name,
              courseCode: course.code,
              sectionName: otherDraft.label,
            };
            break;
          }
        }
        if (entry.busy) break;
      }

      // Then check persisted class slots (regular sections and lab sections
      // alike) via the shared teachersBusyAt helper, so both scheduling
      // flows use the exact same conflict-detection logic.
      if (!entry.busy) {
        const busy = teachersBusyAt(
          data,
          teacherIds,
          { day, start: p.start, end: p.end, week },
          currentSlotId,
          { course_id: course.id, section_id: ignoreEntity.section_id, lab_section_id: ignoreEntity.lab_section_id },
        );
        if (busy) {
          const c = data.courses.find((x) => x.id === busy.slot.course_id);
          const s = data.sections.find((x) => x.id === busy.slot.section_id);
          const otherLabSection = busy.slot.lab_section_id
            ? data.course_lab_sections.find((ls) => ls.id === busy.slot.lab_section_id)
            : null;
          const t = data.teachers.find((x) => x.id === busy.teacherId);
          entry.busy = {
            teacherId: busy.teacherId,
            teacherShort: t?.short_name,
            teacherName: t?.name,
            courseCode: c?.code,
            sectionName: otherLabSection?.label || s?.name || "Lab",
          };
        }
      }

      for (const tid of teacherIds) {
        const u = teacherUnavailableAt(data, tid, { day, start: p.start, end: p.end });
        if (u) {
          const t = data.teachers.find((x) => x.id === tid);
          entry.unavailable = { teacherId: tid, teacherShort: t?.short_name, teacherName: t?.name, reason: u.reason };
          break;
        }
      }

      if (entry.busy || entry.unavailable) map.set(p.id, entry);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, periods, teacherIds, day, week, currentSlotId, course.id, ignoreEntity.section_id, ignoreEntity.lab_section_id, otherOpenEntityDrafts]);

  function siblingDuplicate(p: { start: string; end: string }) {
    return siblingDrafts.some(
      (sd) => sd.day === day && timesOverlap(sd.start, sd.end, p.start, p.end) && weeksOverlap(sd.week, week),
    );
  }

  function findBooking(roomId: string, p: { start: string; end: string }) {
    // First check other entities open in this same modal session.
    for (const otherDraft of otherOpenEntityDrafts) {
      for (const meeting of otherDraft.meetings) {
        if (!meeting.day || !meeting.start || !meeting.end) continue;
        if (meeting.day !== day) continue;
        if (!timesOverlap(meeting.start, meeting.end, p.start, p.end)) continue;
        if (!weeksOverlap(meeting.week, week)) continue;
        return { ...meeting, course_id: course.id, isDraft: true as const, draftLabel: otherDraft.label };
      }
    }
    // Then check persisted class slots.
    return data.class_slots.find((slot) => {
      if (slot.id === currentSlotId) return false;
      if (isOwnSlot(slot.course_id, slot.section_id, slot.lab_section_id)) return false;
      if (slot.room_id !== roomId) return false;
      if (slot.day !== day) return false;
      if (!timesOverlap(slot.start, slot.end, p.start, p.end)) return false;
      if (!weeksOverlap(slot.week, week)) return false;
      return true;
    });
  }

  /** Check if there's a booking on the opposite week and return it */
  function getOppositeWeekBooking(roomId: string, p: { start: string; end: string }) {
    const oppositeWeek: WeekPattern = week === "EVEN" ? "ODD" : "EVEN";
    return data.class_slots.find((slot) => {
      if (slot.id === currentSlotId) return false;
      if (isOwnSlot(slot.course_id, slot.section_id, slot.lab_section_id)) return false;
      if (slot.room_id !== roomId) return false;
      if (slot.day !== day) return false;
      if (!timesOverlap(slot.start, slot.end, p.start, p.end)) return false;
      return weeksOverlap(slot.week, oppositeWeek);
    });
  }

  async function handlePick(roomId: string, p: { start: string; end: string }, issues: string[]) {
    if (issues.length === 0) {
      onPick(roomId, p.start, p.end);
      return;
    }
    const ok = await confirmDialog({
      title: "Select with conflict?",
      description: (
        <div className="space-y-1.5">
          <div>This slot has the following issue{issues.length > 1 ? "s" : ""}:</div>
          <ul className="list-disc pl-5 text-sm">
            {issues.map((m, i) => (
              <li key={i} className="text-destructive">{m}</li>
            ))}
          </ul>
          <div className="text-xs text-muted-foreground pt-1">
            You can still select it — it will appear as a conflict in the error details.
          </div>
        </div>
      ),
      confirmLabel: "Select anyway",
    });
    if (ok) onPick(roomId, p.start, p.end);
  }

  function toneFor(n: number, isPartial: boolean) {
    if (n <= 0 && isPartial) return "bg-yellow-200/70 hover:bg-yellow-300/70 border-yellow-300 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100";
    if (n <= 0) return "bg-success/10 hover:bg-success/25 border-success/30 text-success";
    if (n === 1) return "bg-red-200/70 hover:bg-red-300/70 border-red-300 text-red-900 dark:bg-red-950/40 dark:text-red-100";
    if (n === 2) return "bg-red-400/70 hover:bg-red-500/70 border-red-500 text-red-950 dark:text-red-50";
    return "bg-red-700/80 hover:bg-red-800/80 border-red-900 text-white";
  }

  return (
    <div className="overflow-auto max-h-[50vh] border rounded-md">
      <table className="w-full text-xs table-fixed border-collapse">
        <thead className="sticky top-0 bg-muted z-20 shadow-sm">
          <tr>
            <th className="sticky left-0 top-0 z-30 text-left px-2 py-1.5 font-bold border-b border-r w-[100px] min-w-[100px] max-w-[100px] bg-muted shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Room</th>
            {periods.map((p) => {
              const status = teacherStatusByPeriod.get(p.id);
              const dup = siblingDuplicate(p);
              const issueCount = (status?.busy ? 1 : 0) + (status?.unavailable ? 1 : 0) + (dup ? 1 : 0);
              return (
                <th
                  key={p.id}
                  className={cn(
                    "text-center px-1.5 py-2 font-bold border-b border-r w-[180px] min-w-[180px] max-w-[180px] whitespace-normal align-top break-words",
                    issueCount === 1 && "bg-red-200/40",
                    issueCount >= 2 && "bg-red-500/30",
                  )}
                >
                  <div className="font-mono text-[11px] mb-1">{fmtRange12(p.start, p.end)}</div>
                  {status?.busy && (
                    <div className="text-[10px] font-bold text-destructive font-mono leading-tight mb-1">
                      {status.busy.teacherShort} assigned in {status.busy.courseCode}
                    </div>
                  )}
                  {status?.unavailable && (
                    <div className="text-[10px] font-bold text-warning font-mono leading-tight mb-1">
                      {status.unavailable.teacherShort} unavailable
                    </div>
                  )}
                  {dup && (
                    <div className="text-[10px] font-bold text-destructive uppercase tracking-tighter">Duplicate</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className={cn("sticky left-0 z-10 px-2 py-2 border-r w-[100px] min-w-[100px] max-w-[100px] bg-muted font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]", currentRoomId === r.id && "bg-primary/10")}>
                <div className="font-mono font-semibold">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">Capacity {r.capacity}</div>
              </td>
              {periods.map((p) => {
                const status = teacherStatusByPeriod.get(p.id);
                const teacherBusy = status?.busy;
                const teacherUnavail = status?.unavailable;
                const booking = findBooking(r.id, p);
                const oppositeBooking = getOppositeWeekBooking(r.id, p);
                const dup = siblingDuplicate(p);
                const roomUnavail = roomUnavailableAt(data, r.id, { day, start: p.start, end: p.end });
                const isCurrent =
                  currentRoomId === r.id && currentStart === p.start && currentEnd === p.end;

                const issues: string[] = [];
                let bookedLabel = "";
                if (booking) {
                  if ("isDraft" in booking && booking.isDraft) {
                    bookedLabel = booking.draftLabel;
                    issues.push(`Room ${r.name} is already booked by ${booking.draftLabel} ${fmtRange12(booking.start, booking.end)}.`);
                  } else {
                    const c = data.courses.find((c) => c.id === (booking as any).course_id);
                    const s = data.sections.find((s) => s.id === (booking as any).section_id);
                    const otherLabSection = (booking as any).lab_section_id
                      ? data.course_lab_sections.find((ls) => ls.id === (booking as any).lab_section_id)
                      : null;
                    const courseLabel = c ? `${c.code} - ${c.name}` : "Sessional";
                    const sectionLabel = otherLabSection
                      ? otherLabSection.label
                      : s ? `Level ${s.level} Term ${s.term} Sec ${s.name}` : "Lab";
                    bookedLabel = `${courseLabel} · Sec ${sectionLabel}`;
                    issues.push(`Room ${r.name} is already booked by ${courseLabel} (${sectionLabel}) ${fmtRange12(booking.start, booking.end)}.`);
                  }
                }
                if (teacherBusy) {
                  issues.push(`${teacherBusy.teacherShort} (${teacherBusy.teacherName}) already assigned in ${teacherBusy.courseCode} (Sec ${teacherBusy.sectionName}) at this time.`);
                }
                if (teacherUnavail) {
                  issues.push(`${teacherUnavail.teacherShort} is unavailable at this time${teacherUnavail.reason ? ` (${teacherUnavail.reason})` : ""}.`);
                }
                if (roomUnavail) {
                  issues.push(`Room ${r.name} is unavailable at this time${roomUnavail.reason ? ` (${roomUnavail.reason})` : ""}.`);
                }
                if (dup) {
                  issues.push(`Another meeting for this entity is already on ${day} ${fmtRange12(p.start, p.end)}.`);
                }

                const conflictCount =
                  (booking ? 1 : 0) + (teacherBusy ? 1 : 0) + (teacherUnavail ? 1 : 0) +
                  (roomUnavail ? 1 : 0) + (dup ? 1 : 0);
                const isPartial = conflictCount === 0 && !!oppositeBooking;
                const tone = toneFor(conflictCount, isPartial);
                const oppositeCourse = oppositeBooking ? data.courses.find((c) => c.id === oppositeBooking.course_id) : null;
                const oppositeSection = oppositeBooking ? data.sections.find((s) => s.id === oppositeBooking.section_id) : null;

                let inner: React.ReactNode;
                if (conflictCount === 0) {
                  inner = (
                    <div className={cn("w-full h-full min-h-[44px] rounded border px-1.5 py-1.5 text-[10px] font-black transition uppercase flex flex-col items-center justify-center", tone)}>
                      {isPartial ? (
                        <>
                          <div>Available on {week} Weeks</div>
                          {oppositeCourse && oppositeSection && (
                            <div className="text-[8px] font-normal mt-1">
                              {oppositeCourse.code} at {oppositeSection.level}-{oppositeSection.term} Section {oppositeSection.name} on {oppositeBooking.week} Weeks
                            </div>
                          )}
                        </>
                      ) : (
                        "Free"
                      )}
                    </div>
                  );
                } else {
                  inner = (
                    <div className={cn("w-full h-full min-h-[44px] rounded border px-2 py-2 text-[10px] cursor-pointer transition space-y-1.5 whitespace-normal break-words", tone)}>
                      {booking && (
                        <div className="font-black text-xs leading-tight">{bookedLabel}</div>
                      )}
                      {teacherBusy && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">{teacherBusy.teacherShort} assigned in {teacherBusy.courseCode}</div>
                      )}
                      {teacherUnavail && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">{teacherUnavail.teacherShort} is Unavailable</div>
                      )}
                      {roomUnavail && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">Room {r.name} is Unavailable</div>
                      )}
                      {dup && !booking && !teacherBusy && !teacherUnavail && !roomUnavail && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">Another meeting for this entity is already on {day} {fmtRange12(p.start, p.end)}</div>
                      )}
                      {dup && (booking || teacherBusy || teacherUnavail || roomUnavail) && (
                        <div className="font-black text-[8px] uppercase tracking-tighter opacity-70">+ Duplicate</div>
                      )}
                    </div>
                  );
                }

                const buttonTitle = isPartial
                  ? `Available on ${week} Weeks — click to select`
                  : issues.length > 0
                  ? issues.join(" · ")
                  : "Free — click to select";

                return (
                  <td key={p.id} className="border-r p-1 w-[180px] min-w-[180px] max-w-[180px] align-top">
                    <button
                      type="button"
                      onClick={() => handlePick(r.id, p, issues)}
                      className={cn(
                        "block w-full h-full text-left rounded transition-all hover:scale-[0.98]",
                        isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg",
                      )}
                      title={buttonTitle}
                    >
                      {inner}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr>
              <td colSpan={periods.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                No rooms match the type ({info.roomKind}) and capacity (≥ {totalStudents}).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

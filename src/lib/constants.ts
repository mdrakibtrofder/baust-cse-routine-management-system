/** Short name of the home/owning department (BAUST CSE).
 *  Used wherever "Departmental" defaults to this department, or where it must be
 *  excluded from a "Non-Departmental" picker (other departments only). */
export const HOME_DEPT_SHORT_NAME = "CSE";

/** Auto routine generation must not place theory classes after this period number. */
export const THEORY_AUTO_GENERATION_MAX_PERIOD_NUMBER = 6;

/** Minimum number of weeks between consecutive class tests of the same course.
 *  Keep in sync with `CT_MIN_WEEK_GAP` in shared/constants.ts and the backend copy
 *  in ct-schedule.service.ts. */
export const CT_MIN_WEEK_GAP = 3;

/** Password required to unlock an already-generated CT schedule for regeneration.
 *  A workflow guard against accidental regeneration, not a security control —
 *  it is checked in the browser and is visible to anyone reading the bundle. */
export const CT_UNLOCK_PASSWORD = "BAUST_FAMILY";

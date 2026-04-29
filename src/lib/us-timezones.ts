const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix",
  AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York", DE: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise",
  IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago",
  ME: "America/New_York", MD: "America/New_York", MA: "America/New_York",
  MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York",
  NM: "America/Denver", NY: "America/New_York", NC: "America/New_York",
  ND: "America/Chicago", OH: "America/New_York", OK: "America/Chicago",
  OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago",
  TX: "America/Chicago", UT: "America/Denver", VT: "America/New_York",
  VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York",
  WI: "America/Chicago", WY: "America/Denver", DC: "America/New_York",
  PR: "America/Puerto_Rico", VI: "America/Virgin", GU: "Pacific/Guam",
};

export function getTimezoneForState(stateCode: string): string {
  return STATE_TZ[stateCode.toUpperCase().trim()] || "America/New_York";
}

/**
 * Get the next optimal send time for a broker based on their state.
 * Best times: Tuesday or Thursday at 9:00 AM local time.
 * If today is Tue/Thu and it's before 9 AM local, schedule for today 9 AM.
 * Otherwise, schedule for the next Tue or Thu at 9 AM.
 */
export function getNextOptimalSendTime(stateCode: string): Date {
  const tz = getTimezoneForState(stateCode);
  const now = new Date();

  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const dayOfWeek = localNow.getDay();
  const hour = localNow.getHours();

  let daysToAdd = 0;

  if (dayOfWeek === 2 && hour < 9) {
    daysToAdd = 0;
  } else if (dayOfWeek === 4 && hour < 9) {
    daysToAdd = 0;
  } else if (dayOfWeek < 2) {
    daysToAdd = 2 - dayOfWeek;
  } else if (dayOfWeek < 4) {
    daysToAdd = 4 - dayOfWeek;
  } else {
    daysToAdd = (9 - dayOfWeek) % 7;
    if (daysToAdd === 0) daysToAdd = 7;
    const nextTue = (9 - dayOfWeek) % 7 || 7;
    const nextThu = dayOfWeek <= 4 ? 4 - dayOfWeek : (11 - dayOfWeek);
    daysToAdd = Math.min(
      dayOfWeek === 2 ? 2 : dayOfWeek === 4 ? 5 : (2 - dayOfWeek + 7) % 7 || 7,
      dayOfWeek === 4 ? 2 : (4 - dayOfWeek + 7) % 7 || 7,
    );
  }

  const targetLocal = new Date(localNow);
  targetLocal.setDate(targetLocal.getDate() + daysToAdd);
  targetLocal.setHours(9, 0, 0, 0);

  const offsetMs = now.getTime() - localNow.getTime();
  return new Date(targetLocal.getTime() + offsetMs);
}

/**
 * Simpler version: get next Tue or Thu at 9 AM in a given timezone.
 */
export function nextTueThu9AM(tz: string): Date {
  const now = new Date();
  for (let d = 0; d < 8; d++) {
    const candidate = new Date(now.getTime() + d * 86400000);
    const local = new Date(candidate.toLocaleString("en-US", { timeZone: tz }));
    const dow = local.getDay();
    if ((dow === 2 || dow === 4) && (d > 0 || local.getHours() < 9)) {
      local.setHours(9, 0, 0, 0);
      const offset = candidate.getTime() - local.getTime();
      const result = new Date(local.getTime() + offset);
      return result;
    }
  }
  const fallback = new Date(now.getTime() + 2 * 86400000);
  fallback.setUTCHours(14, 0, 0, 0);
  return fallback;
}

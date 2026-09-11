/**
 * Railway Block Planning - Operations Formatters & Helpers
 */

/**
 * Converts minute of the day (0 to 1440) to 24-hour HH:MM format.
 */
export function formatMinuteToTime(minutes: number): string {
  if (isNaN(minutes) || minutes < 0) return '00:00';
  const clamped = Math.min(1440, Math.max(0, minutes));
  const hrs = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Converts 24-hour HH:MM format to minute of day (0-1440).
 */
export function parseTimeToMinute(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  return Math.min(1440, Math.max(0, h * 60 + m));
}

/**
 * Formats duration in minutes to readable hours and minutes.
 */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

/**
 * Formats timestamp to concise localized string.
 */
export function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats kilometrage to standard railway chainage notation (e.g. KM 12.50).
 */
export function formatKm(km?: number | null): string {
  if (km === undefined || km === null || isNaN(km)) return 'KM —';
  return `KM ${Number(km).toFixed(2)}`;
}

/**
 * Maps urgency priority to UI badge variant.
 */
export function getUrgencyBadgeVariant(urgency?: string): 'red' | 'amber' | 'blue' | 'slate' {
  switch (urgency?.toUpperCase()) {
    case 'CRITICAL':
      return 'red';
    case 'HIGH':
      return 'amber';
    case 'MEDIUM':
      return 'amber';
    case 'LOW':
      return 'blue';
    default:
      return 'slate';
  }
}

/**
 * Maps request lifecycle status to UI badge variant.
 */
export function getRequestStatusVariant(status?: string): 'emerald' | 'amber' | 'red' | 'blue' | 'slate' {
  switch (status?.toUpperCase()) {
    case 'APPROVED':
    case 'SCHEDULED':
      return 'emerald';
    case 'PENDING':
      return 'amber';
    case 'REJECTED':
      return 'red';
    default:
      return 'slate';
  }
}

// Host availability rules (pure). Every visit takes a 30-minute slot: with a visit at 15:00,
// 14:30 and 15:30 are still free, but 14:45 or 15:15 overlap and are taken.
export const SLOT_MINUTES = 30;

export function officeHours() {
  return {
    open: process.env.ORG_OPEN_TIME || '08:00',
    close: process.env.ORG_CLOSE_TIME || '17:00',
  };
}

export function toMinutes(time) {
  const m = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function fromMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Open visits (pending or approved) that hold a slot for this host on this date.
export function hostBookings(bookings, hostId, date) {
  return (bookings || [])
    .filter((b) => Number(b.hostId) === Number(hostId) && b.date === date && ['pending', 'approved'].includes(b.status || 'pending'))
    .map((b) => ({ ...b, minutes: toMinutes(b.time) }))
    .filter((b) => b.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);
}

export function conflictAt(bookings, hostId, date, time, { ignoreRef = null } = {}) {
  const t = toMinutes(time);
  if (t === null) return null;
  return hostBookings(bookings, hostId, date).find((b) => b.ref !== ignoreRef && Math.abs(b.minutes - t) < SLOT_MINUTES) || null;
}

// 'past' when the time has gone today, 'closed' when outside office hours, otherwise null.
export function timeProblem({ date, time, today, now, hours = officeHours() }) {
  const t = toMinutes(time);
  if (t === null) return null;
  if (t < toMinutes(hours.open) || t > toMinutes(hours.close) - SLOT_MINUTES) return 'closed';
  if (date && today && date === today && now && t <= toMinutes(now)) return 'past';
  return null;
}

// Free 30-minute slots for a host on a date, within office hours and not in the past.
export function freeSlots({ bookings, hostId, date, today, now, hours = officeHours() }) {
  const out = [];
  const last = toMinutes(hours.close) - SLOT_MINUTES;
  for (let t = toMinutes(hours.open); t <= last; t += SLOT_MINUTES) {
    const time = fromMinutes(t);
    if (timeProblem({ date, time, today, now, hours })) continue;
    if (!conflictAt(bookings, hostId, date, time)) out.push(time);
  }
  return out;
}

// Free slots closest to the requested time, returned in time order.
export function nearestFree(slots, time, count = 4) {
  const t = toMinutes(time) ?? 0;
  return [...slots]
    .sort((a, b) => Math.abs(toMinutes(a) - t) - Math.abs(toMinutes(b) - t))
    .slice(0, count)
    .sort((a, b) => toMinutes(a) - toMinutes(b));
}

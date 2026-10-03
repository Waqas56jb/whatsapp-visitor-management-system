export function formatDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateNice(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function mapHost(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    dept: row.department,
    department: row.department,
    phone: row.phone,
    office: row.office || '',
    email: row.email || '',
    status: row.status,
  };
}

export function mapVisitor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    phone: row.phone || '',
    email: row.email || '',
    profileType: row.profile_type || '',
    visits: Number(row.visit_count || 0),
    lastVisit: row.last_visit ? formatDateNice(row.last_visit) : '—',
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapVisit(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref_number,
    visitor: row.visitor_name,
    company: row.visitor_company || '',
    host: row.host_name,
    hostDepartment: row.host_department || '',
    purpose: row.purpose,
    date: formatDate(row.visit_date),
    time: row.visit_time,
    status: row.status,
    pin: row.pin || null,
    qrToken: row.qr_token,
    visitType: row.visit_type || 'official',
    visitorPhone: row.visitor_phone || row.visitor_profile_phone || null,
    usedAt: row.used_at || null,
    checkedOutAt: row.checked_out_at || null,
    kind: row.kind || 'visit',
    appointmentType: row.appointment_type || '',
    topic: row.topic || '',
    flagged: Boolean(row.flagged),
    flagReason: row.flag_reason || '',
    screening: row.screening || {},
    hostOffice: row.host_office || '',
    decidedBy: row.decided_by || '',
    createdAt: row.created_at,
  };
}

export function mapAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    at: row.created_at,
    time: new Date(row.created_at).toLocaleString('en-GB', { timeZone: process.env.ORG_TIMEZONE || 'Africa/Gaborone' }),
    actor: row.actor,
    action: row.action,
    details: row.details,
  };
}

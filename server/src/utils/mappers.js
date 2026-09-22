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
    status: row.status,
    account_id: row.account_id,
  };
}

export function mapVisitor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    visits: Number(row.visit_count || 0),
    lastVisit: row.last_visit ? formatDateNice(row.last_visit) : '—',
    status: row.status,
  };
}

export function mapVisit(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref_number,
    visitor: row.visitor_name,
    host: row.host_name,
    purpose: row.purpose,
    date: formatDate(row.visit_date),
    time: row.visit_time,
    status: row.status,
    qrToken: row.qr_token,
    visitType: row.visit_type || 'official',
    visitorPhone: row.visitor_phone || row.visitor_profile_phone || null,
    usedAt: row.used_at || null,
  };
}

export function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    created: formatDateNice(row.created_at),
    status: row.status,
  };
}

export function mapAudit(row) {
  if (!row) return null;
  return {
    time: new Date(row.created_at).toLocaleString(),
    actor: row.actor,
    action: row.action,
    details: row.details,
  };
}

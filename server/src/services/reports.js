// Company reports: visit volumes by day, peak check-in hours, host activity, status and type
// breakdowns, feedback and service requests, as JSON, CSV or a PDF document.
import PDFDocument from 'pdfkit';
import { Feedback, ServiceRequest, companyReport } from '../models/index.js';

export async function buildReport(from, to) {
  const base = await companyReport(from, to);
  const [feedback, requests] = await Promise.all([Feedback.list(), ServiceRequest.list()]);
  const inRange = (row) => {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    return day >= from && day <= to;
  };
  const fb = feedback.filter(inRange);
  const sr = requests.filter(inRange);
  const rated = fb.filter((f) => f.rating != null);
  const total = base.byDay.reduce((s, d) => s + d.visits, 0);
  const peak = [...base.byHour].sort((a, b) => b.check_ins - a.check_ins)[0] || null;
  return {
    from,
    to,
    totals: {
      visits: total,
      approved: base.byStatus.filter((s) => ['approved', 'used'].includes(s.status)).reduce((n, s) => n + s.count, 0),
      checkedIn: base.byStatus.find((s) => s.status === 'used')?.count || 0,
      rejected: base.byStatus.find((s) => s.status === 'rejected')?.count || 0,
      cancelled: base.byStatus.find((s) => s.status === 'cancelled')?.count || 0,
      pending: base.byStatus.find((s) => s.status === 'pending')?.count || 0,
      feedback: fb.length,
      complaints: fb.filter((f) => f.is_complaint).length,
      averageRating: rated.length ? Math.round((rated.reduce((s, f) => s + f.rating, 0) / rated.length) * 10) / 10 : null,
      serviceRequests: sr.length,
      openServiceRequests: sr.filter((r) => ['open', 'in_progress'].includes(r.status)).length,
      peakHour: peak ? `${String(peak.hour).padStart(2, '0')}:00` : null,
    },
    byDay: base.byDay.map((d) => ({ day: String(d.day).slice(0, 10), visits: d.visits })),
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, checkIns: base.byHour.find((h) => h.hour === hour)?.check_ins || 0 })),
    byHost: base.byHost,
    byStatus: base.byStatus,
    byType: base.byType,
  };
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const cell = (v) => {
    const text = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Cells starting with = + - @ are prefixed so spreadsheets never run them as formulas.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [keys.join(','), ...rows.map((row) => keys.map((k) => cell(row[k])).join(','))].join('\n');
}

export function reportPdf(report, { companyName, color = '#0f766e' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor(color).fontSize(20).text(companyName, { continued: false });
    doc.fillColor('#111').fontSize(13).text(`Visitor report · ${report.from} to ${report.to}`);
    doc.moveDown(0.3).fontSize(9).fillColor('#666').text(`Generated ${new Date().toLocaleString('en-GB')}`);
    doc.moveDown();

    const t = report.totals;
    const kpis = [
      ['Visit requests', t.visits],
      ['Approved', t.approved],
      ['Checked in', t.checkedIn],
      ['Declined', t.rejected],
      ['Cancelled', t.cancelled],
      ['Pending', t.pending],
      ['Peak check-in hour', t.peakHour || '—'],
      ['Feedback received', t.feedback],
      ['Average rating', t.averageRating == null ? '—' : `${t.averageRating} / 5`],
      ['Complaints', t.complaints],
      ['Service requests', t.serviceRequests],
      ['Open service requests', t.openServiceRequests],
    ];
    doc.fillColor(color).fontSize(13).text('Summary');
    doc.moveDown(0.3).fillColor('#111').fontSize(10);
    for (const [label, value] of kpis) doc.text(`${label}: ${value}`);
    doc.moveDown();

    doc.fillColor(color).fontSize(13).text('Visits by day');
    doc.moveDown(0.3).fillColor('#111').fontSize(10);
    if (!report.byDay.length) doc.text('No visits in this period.');
    const maxDay = Math.max(1, ...report.byDay.map((d) => d.visits));
    for (const d of report.byDay.slice(-31)) {
      const y = doc.y;
      doc.text(d.day, 48, y, { width: 80 });
      doc.rect(130, y + 2, (300 * d.visits) / maxDay, 8).fill(color);
      doc.fillColor('#111').text(String(d.visits), 440, y);
      doc.moveDown(0.2);
    }
    doc.moveDown();

    doc.fillColor(color).fontSize(13).text('Peak hours (check-ins)', 48);
    doc.moveDown(0.3).fillColor('#111').fontSize(10);
    const busy = report.byHour.filter((h) => h.checkIns > 0);
    if (!busy.length) doc.text('No check-ins in this period.');
    const maxHour = Math.max(1, ...busy.map((h) => h.checkIns));
    for (const h of busy) {
      const y = doc.y;
      doc.text(`${String(h.hour).padStart(2, '0')}:00`, 48, y, { width: 80 });
      doc.rect(130, y + 2, (300 * h.checkIns) / maxHour, 8).fill(color);
      doc.fillColor('#111').text(String(h.checkIns), 440, y);
      doc.moveDown(0.2);
    }
    doc.moveDown();

    doc.fillColor(color).fontSize(13).text('Host activity', 48);
    doc.moveDown(0.3).fillColor('#111').fontSize(10);
    if (!report.byHost.length) doc.text('No host activity in this period.');
    for (const h of report.byHost) {
      doc.text(`${h.host}${h.department && h.department !== '—' ? ` (${h.department})` : ''}: ${h.visits} visits · ${h.approved} approved · ${h.rejected} declined`);
    }
    doc.end();
  });
}

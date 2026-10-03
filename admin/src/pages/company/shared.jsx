import { useState } from 'react';
import { AlertTriangle, Check, FileImage, Flag, X } from 'lucide-react';
import api, { errorText, openFile } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, Field, Modal, notify } from '../../ui';

export const KIND_LABEL = { visit: 'Visit', appointment: 'Appointment' };

export function KindTag({ v }) {
  const { t } = useI18n();
  return <span className={`type-tag ${v.kind === 'appointment' ? 'social' : 'official'}`}>{t(KIND_LABEL[v.kind] || 'Visit')}</span>;
}

export function FlagTag({ v }) {
  const { t } = useI18n();
  if (!v.flagged) return null;
  return (
    <span className="flag-tag" title={v.flagReason}>
      <AlertTriangle size={11} /> {t('Flagged')}
    </span>
  );
}

export function useVisitActions(reload) {
  const { t } = useI18n();
  return {
    decide: async (id, decision) =>
      (await act(
        () => api.patch(`/visits/${id}/${decision === 'approved' ? 'approve' : 'reject'}`),
        decision === 'approved' ? t('Approved — the visitor received the QR pass on WhatsApp') : t('Declined — the visitor has been told'),
        t('Could not update the visit')
      )) && reload(),
  };
}

// Full details of one visit: screening answers, ID document, flag, decision.
export function VisitModal({ visit, onClose, onChanged, canDecide, canFlag }) {
  const { t, formatDate, formatDateTime } = useI18n();
  const [flagReason, setFlagReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!visit) return null;
  const s = visit.screening || {};

  async function run(fn, ok, fail) {
    setBusy(true);
    const res = await act(fn, ok, fail);
    setBusy(false);
    if (res) onChanged?.();
  }

  async function viewId() {
    try {
      await openFile(`/documents/${visit.idDocumentId}`);
    } catch (err) {
      notify.err(errorText(err, t('Could not open the document')));
    }
  }

  const rows = [
    ['Reference', visit.ref],
    ['Type', t(KIND_LABEL[visit.kind] || 'Visit')],
    ['Visitor', visit.visitor],
    ['Company', visit.company || '—'],
    ['Phone', visit.visitorPhone ? `+${visit.visitorPhone}` : '—'],
    ['Host', `${visit.host}${visit.hostDepartment && visit.hostDepartment !== '—' ? ` · ${visit.hostDepartment}` : ''}`],
    ['Purpose', visit.purpose],
    visit.topic ? ['Topic', visit.topic] : null,
    ['Date / Time', `${formatDate(visit.date)} · ${visit.time}`],
    ['Status', <Badge key="s" status={visit.status} />],
    visit.decidedBy ? ['Decided by', visit.decidedBy] : null,
    visit.pin ? ['Backup PIN', visit.pin] : null,
    visit.usedAt ? ['Checked in', formatDateTime(visit.usedAt)] : null,
    visit.checkedOutAt ? ['Checked out', formatDateTime(visit.checkedOutAt)] : null,
    s.nda?.accepted ? ['NDA', t('Accepted on WhatsApp')] : null,
  ].filter(Boolean);

  return (
    <Modal open title={visit.ref} onClose={onClose} wide>
      <div className="modal-body">
        {visit.flagged ? (
          <p className="secret-warning">
            <AlertTriangle size={15} /> {visit.flagReason}
          </p>
        ) : null}
        {rows.map(([k, v]) => (
          <div className="detail-row" key={k}>
            <span className="k">{t(k)}</span>
            <span className="v">{v}</span>
          </div>
        ))}
        {s.health?.length ? (
          <div className="screening">
            <b>{t('Health screening')}</b>
            {s.health.map((h, i) => (
              <div key={i} className={h.answer === 'yes' ? 'bad-text' : ''}>
                {h.question} — <b>{h.answer === 'yes' ? t('Yes') : t('No')}</b>
              </div>
            ))}
          </div>
        ) : null}
        {visit.qrImage ? <img className="qr-preview" src={visit.qrImage} alt={t('QR pass')} /> : null}
        {canFlag ? (
          <div className="flag-box">
            {visit.flagged ? (
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => api.patch(`/visits/${visit.id}/flag`, { flagged: false }), t('Flag cleared'), t('Could not update'))}>
                {t('Clear flag')}
              </button>
            ) : (
              <>
                <Field label={t('Flag for security')}>
                  <input value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder={t('e.g. Verify ID at the gate')} />
                </Field>
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => api.patch(`/visits/${visit.id}/flag`, { flagged: true, reason: flagReason }), t('Visit flagged'), t('Could not update'))}>
                  <Flag size={13} /> {t('Flag')}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
      <div className="form-actions">
        {visit.idDocumentId ? (
          <button className="btn btn-ghost" onClick={viewId}>
            <FileImage size={15} /> {t('View ID document')}
          </button>
        ) : null}
        {canDecide && visit.status === 'pending' ? (
          <>
            <button className="btn btn-danger" disabled={busy} onClick={() => run(() => api.patch(`/visits/${visit.id}/reject`), t('Declined — the visitor has been told'), t('Could not update'))}>
              <X size={15} /> {t('Decline')}
            </button>
            <button className="btn btn-teal" disabled={busy} onClick={() => run(() => api.patch(`/visits/${visit.id}/approve`), t('Approved — the visitor received the QR pass on WhatsApp'), t('Could not update'))}>
              <Check size={15} /> {t('Approve')}
            </button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export async function loadVisit(id) {
  const { data } = await api.get(`/visits/${id}`);
  return data;
}

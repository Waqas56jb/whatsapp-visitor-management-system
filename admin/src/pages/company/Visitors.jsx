import { useState } from 'react';
import { FileImage, MoreHorizontal, Users } from 'lucide-react';
import api, { errorText, openFile } from '../../api/client';
import { useI18n } from '../../i18n';
import { Badge, EmptyRow, Modal, notify, Panel, SearchInput, initials, matches, useApi } from '../../ui';

const PROFILE = { organisation: 'Organisation', individual: 'Individual', other: 'Other' };

export default function Visitors() {
  const { t, formatDate } = useI18n();
  const { data } = useApi('/visitors', { initial: [] });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const rows = (data || []).filter((v) => matches(query, v.name, v.company, v.phone, v.email));

  async function show(id) {
    try {
      const { data: v } = await api.get(`/visitors/${id}`);
      setOpen(v);
    } catch (err) {
      notify.err(errorText(err, t('Could not load the visitor')));
    }
  }

  return (
    <>
      <Panel icon={Users} title={t('Visitors')} sub={t('Profiles created on WhatsApp or by staff')} actions={<SearchInput value={query} onChange={setQuery} />}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Visitor')}</th>
                <th>{t('Company')}</th>
                <th>{t('Contact')}</th>
                <th>{t('Visits')}</th>
                <th>{t('Last visit')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t('Visitor')}>
                      <div className="row-flex">
                        <div className="avatar-sm">{initials(v.name)}</div>
                        <div>
                          <div className="cell-main">{v.name}</div>
                          <div className="cell-sub">{t(PROFILE[v.profileType] || '')}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label={t('Company')}>{v.company && v.company !== '—' ? v.company : '—'}</td>
                    <td data-label={t('Contact')}>
                      <div>{v.phone ? `+${v.phone}` : '—'}</div>
                      {v.email ? <div className="cell-sub">{v.email}</div> : null}
                    </td>
                    <td data-label={t('Visits')}>{v.visits}</td>
                    <td data-label={t('Last visit')}>{v.lastVisit}</td>
                    <td data-label={t('Actions')}>
                      <button className="btn-icon" onClick={() => show(v.id)} aria-label={t('View details')}>
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={6} icon={Users}>
                  {query ? t('No results for "{query}"', { query }) : t('No visitors yet')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Modal open={Boolean(open)} title={open?.name || ''} onClose={() => setOpen(null)} wide>
        {open ? (
          <>
            <div className="modal-body">
              {[
                ['Company', open.company && open.company !== '—' ? open.company : '—'],
                ['Visiting as', t(PROFILE[open.profileType] || '—')],
                ['WhatsApp', open.phone ? `+${open.phone}` : '—'],
                ['Email', open.email || '—'],
                ['Total visits', open.history.length],
              ].map(([k, v]) => (
                <div className="detail-row" key={k}>
                  <span className="k">{t(k)}</span>
                  <span className="v">{v}</span>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Reference')}</th>
                    <th>{t('Host')}</th>
                    <th>{t('Date')}</th>
                    <th>{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {open.history.map((h) => (
                    <tr key={h.id}>
                      <td data-label={t('Reference')}>{h.ref}</td>
                      <td data-label={t('Host')}>{h.host}</td>
                      <td data-label={t('Date')}>
                        {formatDate(h.date)} · {h.time}
                      </td>
                      <td data-label={t('Status')}>
                        <Badge status={h.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {open.idDocumentId ? (
              <div className="form-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => openFile(`/documents/${open.idDocumentId}`).catch((err) => notify.err(errorText(err, t('Could not open the document'))))}
                >
                  <FileImage size={15} /> {t('View ID document')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}

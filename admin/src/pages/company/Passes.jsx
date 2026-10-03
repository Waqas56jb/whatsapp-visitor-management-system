import { useState } from 'react';
import { QrCode, X } from 'lucide-react';
import api from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Panel, SearchInput, matches, useApi } from '../../ui';

export default function Passes({ me }) {
  const { t, formatDate } = useI18n();
  const { data, reload } = useApi('/passes', { initial: [] });
  const [query, setQuery] = useState('');
  const canRevoke = me.permissions.includes('passes.revoke');
  const rows = (data || []).filter((v) => matches(query, v.ref, v.visitor, v.host, v.pin));

  async function revoke(v) {
    if (!window.confirm(t('Revoke the pass of {name}? It will stop working at the gate.', { name: v.visitor }))) return;
    if (await act(() => api.post(`/passes/${v.id}/revoke`), t('Pass revoked'), t('Could not revoke the pass'))) reload();
  }

  return (
    <Panel icon={QrCode} title={t('QR & passes')} sub={t('Approved passes that can still be used at the gate')} actions={<SearchInput value={query} onChange={setQuery} />}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('QR')}</th>
              <th>{t('Reference')}</th>
              <th>{t('Visitor')}</th>
              <th>{t('Host')}</th>
              <th>{t('Backup PIN')}</th>
              <th>{t('Visit date')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((v) => (
                <tr key={v.id}>
                  <td data-label={t('QR')}>{v.qrImage ? <img className="qr-thumb" src={v.qrImage} alt="" /> : '—'}</td>
                  <td className="cell-main nowrap" data-label={t('Reference')}>
                    {v.ref}
                  </td>
                  <td data-label={t('Visitor')}>{v.visitor}</td>
                  <td data-label={t('Host')}>{v.host}</td>
                  <td data-label={t('Backup PIN')} className="mono">
                    {v.pin || '—'}
                  </td>
                  <td data-label={t('Visit date')}>
                    {formatDate(v.date)} · {v.time} <Badge status="active" />
                  </td>
                  <td data-label={t('Actions')}>
                    {canRevoke ? (
                      <button className="btn btn-sm btn-danger" onClick={() => revoke(v)}>
                        <X size={13} strokeWidth={2.5} /> {t('Revoke')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow cols={7} icon={QrCode}>
                {t('No active passes')}
              </EmptyRow>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

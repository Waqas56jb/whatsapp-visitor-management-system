import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useI18n } from '../../i18n';
import { EmptyRow, Panel, SearchInput, matches, useApi } from '../../ui';

export default function Audit() {
  const { t, formatDateTime } = useI18n();
  const { data } = useApi('/audit', { initial: [], params: { limit: 1000 } });
  const [query, setQuery] = useState('');
  const rows = (data || []).filter((a) => matches(query, a.actor, a.action, a.details));
  return (
    <Panel icon={ScrollText} title={t('Audit log')} sub={t('Who did what in this company — approvals, check-ins, staff and settings changes')} actions={<SearchInput value={query} onChange={setQuery} />}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('When')}</th>
              <th>{t('Who')}</th>
              <th>{t('Action')}</th>
              <th>{t('Details')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((a) => (
                <tr key={a.id}>
                  <td data-label={t('When')} className="nowrap">
                    {formatDateTime(a.at)}
                  </td>
                  <td data-label={t('Who')} className="cell-main">
                    {a.actor}
                  </td>
                  <td data-label={t('Action')}>{t(a.action)}</td>
                  <td data-label={t('Details')} className="wrap-cell">
                    {a.details}
                  </td>
                </tr>
              ))
            ) : (
              <EmptyRow cols={4} icon={ScrollText}>
                {t('No entries')}
              </EmptyRow>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

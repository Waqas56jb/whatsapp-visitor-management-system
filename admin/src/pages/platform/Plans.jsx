import { Check, Layers, Minus } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Panel, fmtMoney, useApi } from '../../ui';

export default function Plans() {
  const { t } = useI18n();
  const { data } = useApi('/platform/plans');
  if (!data) return <p className="mini-note pad">{t('Loading…')}</p>;
  return (
    <>
      <div className="plan-cards">
        {data.plans.map((p) => (
          <div className="plan-card" key={p.key}>
            <h3>{t(p.name)}</h3>
            <b className="plan-price">
              {fmtMoney(p.price, p.currency)}
              <small> / {t('month')}</small>
            </b>
            <ul>
              {Object.entries(data.limits).map(([key, label]) => (
                <li key={key}>
                  <span>{t(label)}</span>
                  <b>{p.limits[key] == null ? t('Unlimited') : p.limits[key]}</b>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Panel icon={Layers} title={t('Features by plan')} sub={t('A company’s features can also be switched on or off individually on its page.')}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Feature')}</th>
                {data.plans.map((p) => (
                  <th key={p.key}>{t(p.name)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.features).map(([key, label]) => (
                <tr key={key}>
                  <td data-label={t('Feature')} className="cell-main">
                    {t(label)}
                  </td>
                  {data.plans.map((p) => (
                    <td key={p.key} data-label={t(p.name)}>
                      {p.features.includes(key) ? <Check size={16} className="ok-text" /> : <Minus size={16} className="muted" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

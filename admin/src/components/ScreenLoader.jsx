import { Loader2 } from 'lucide-react';
import { useI18n } from '../i18n';

export default function ScreenLoader({ show, label }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div className="screen-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="screen-loader-card">
        <Loader2 className="spin screen-loader-icon" strokeWidth={2.2} />
        <b>{label || t('Please wait…')}</b>
      </div>
    </div>
  );
}

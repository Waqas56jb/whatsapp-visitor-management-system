import { Loader2 } from 'lucide-react';

export default function ScreenLoader({ show, label = 'Please wait…' }) {
  if (!show) return null;
  return (
    <div className="screen-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="screen-loader-card">
        <Loader2 className="spin screen-loader-icon" strokeWidth={2.2} />
        <b>{label}</b>
      </div>
    </div>
  );
}

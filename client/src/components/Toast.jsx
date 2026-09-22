import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Toast({ toasts }) {
  return (
    <div id="toastWrap">
      {toasts.map((t) => (
        <div key={t.id} className={'toast' + (t.isErr ? ' err' : '')}>
          {t.isErr ? <AlertTriangle size={16} strokeWidth={2} /> : <CheckCircle2 size={16} strokeWidth={2} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

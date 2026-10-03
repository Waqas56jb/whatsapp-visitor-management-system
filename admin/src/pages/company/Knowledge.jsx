import KnowledgeBase from '../../components/KnowledgeBase';
import { notify } from '../../ui';

// Internal FAQs, documents and websites the WhatsApp assistant answers "Ask a Question" from.
export default function Knowledge() {
  return <KnowledgeBase onToast={(msg, isErr) => (isErr ? notify.err(msg) : notify.ok(msg))} />;
}

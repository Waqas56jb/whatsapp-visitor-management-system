// Used only while a company has not trained its assistant yet. Company-neutral on purpose:
// every company sees these until it adds its own knowledge.
export const KNOWLEDGE_DEFAULTS = {
  instruction: 'Answer only from this knowledge base. Never invent services, staff, or prices.',
  faqs: [],
};

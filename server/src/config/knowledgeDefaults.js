export const FIRST_TIME_WELCOME =
  'Welcome to Botho Innovations Visitor Management System. Please provide your details (Names, Company, Purpose, Visit date, Time).';

export const KNOWLEDGE_DEFAULTS = {
  greeting: FIRST_TIME_WELCOME,
  instruction: 'Always ask who they are visiting (host name or department). Notify only that saved host. Always ask for company name. Office hours are 8am–5pm.',
  faqs: [
    {
      question: 'Where is the office?',
      answer: 'We are at Botho Innovations reception. Please check in at the front desk.',
    },
  ],
};

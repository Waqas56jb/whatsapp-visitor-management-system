import { normalizeLang } from './lang.js';

const TN_MONTHS = [
  'Ferikgong', 'Tlhakole', 'Mopitlwe', 'Moranang', 'Motsheganong', 'Seetebosigo',
  'Phukwi', 'Phatwe', 'Lwetse', 'Diphalane', 'Ngwanatsele', 'Sedimonthole',
];
const TN_DAYS = ['Tshipi', 'Mosupologo', 'Labobedi', 'Laboraro', 'Labone', 'Labotlhano', 'Lamatlhatso'];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatVisitDate(value, lang = 'en') {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value || '');
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (normalizeLang(lang) === 'tn') return `${TN_DAYS[dow]}, ${day} ${TN_MONTHS[month - 1]} ${year}`;
  return `${EN_DAYS[dow]}, ${day} ${EN_MONTHS[month - 1]} ${year}`;
}

export function formatVisitTime(value, lang = 'en') {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(value || '');
  const h = Number(m[1]);
  if (normalizeLang(lang) === 'tn') return `${String(h).padStart(2, '0')}:${m[2]}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m[2]} ${suffix}`;
}

const CATALOG = {
  en: {
    welcome:
      'Welcome to Botho Innovations Visitor Management System. Please provide your details (Names, Company, Purpose, Visit date, Time).',
    'ask.name': 'May I have your full name?',
    'ask.company': 'Which company are you visiting from?',
    'ask.purpose': 'What is the purpose of your visit?',
    'ask.host': 'Who would you like to visit? Please share the host name or department.',
    'ask.date': 'Which date would you like to visit? For example: 25 September, or tomorrow.',
    'ask.time': 'What time will you arrive? For example: 10am, or 15:00.',
    'retry.name': 'Please send your full name as it should appear on your pass, for example: Michael Ntsima.',
    'retry.company': 'Please send the name of your company. If this is a personal visit, reply: Personal.',
    'retry.purpose': 'Please tell me briefly why you are visiting, for example: Sales meeting.',
    'retry.date': "I couldn't read that date. Please send it like 25 September, 25/09/2026, or tomorrow.",
    'retry.time': "I couldn't read that time. Please send it like 10am, 3:30 pm, or 15:00.",
    'date.past': 'That date has already passed. Please send a date from today onwards.',
    'host.none': 'I don\'t have a host or department called "{query}" saved. Please choose one of these by replying with the number:',
    'host.none.again': "That doesn't match anyone on the list. Please reply with a number, or type the name exactly as shown:",
    'host.many': 'More than one host matches "{query}". Please reply with the number of the person you are visiting:',
    'host.pick': 'Please choose the host you are visiting by replying with the number:',
    'host.directoryEmpty':
      "Our host directory has not been set up yet, so I can't complete a booking on WhatsApp right now. Please contact reception.",
    'label.name': 'Name',
    'label.company': 'Company',
    'label.purpose': 'Purpose',
    'label.host': 'Host',
    'label.date': 'Date',
    'label.time': 'Time',
    confirm: 'Please confirm your visit details:\n{summary}\n\nReply YES to submit, or tell me what to change.',
    'confirm.reminder': 'Reply YES to submit this request, or tell me what to change (for example: time 11am).',
    'confirm.change': 'No problem. What would you like to change? For example: time 11am, or date 26 September.',
    submitted:
      'Your visit request has been submitted.\nReference: {ref}\nHost: {host}\nDate: {date} at {time}\n\nYou will receive a notification here as soon as your visit is approved or declined.',
    'book.failed': "Sorry, I couldn't submit your request just now. Please reply YES to try again.",
    'book.hostGone': 'That host is no longer available. Please choose another host by replying with the number:',
    cancelled: 'Your booking has been cancelled. Send Hi whenever you would like to start a new one.',
    'status.header': 'Reference: {ref}\nHost: {host}\nDate: {date} at {time}\nStatus: {status}',
    'status.notFound': "I couldn't find a visit with reference {ref} for this number. Please check the reference and try again.",
    'status.pending': 'Pending host approval',
    'status.approved': 'Approved',
    'status.rejected': 'Declined',
    'status.used': 'Checked in',
    'status.blocked': 'Blocked',
    offTopic: 'I can only help with visitor bookings and visit information for Botho Innovations.',
    approveDenied:
      "Visits can't be approved or rejected from this chat. Your host will approve or decline your request, and you will be notified here.",
    'faq.fallback': "I don't have that information. Please ask at reception when you arrive.",
    'faq.startBooking': 'To book a visit, send your details (Names, Company, Purpose, Visit date, Time).',
    textOnly: 'I can only read text messages.',
    'visit.summary': '{ref}, host {host}, {date} at {time}. Status: {status}.',
    'visit.latest': 'Your latest visit request: {summary}',
    'welcome.existing': 'You already have a visit request: {summary}\nIf you would like to book another visit, send your details.',
    'thanks.idle': "You're welcome. Send Hi whenever you would like to book another visit.",
    'thanks.busy': "You're welcome.",
    error: 'Sorry, something went wrong on our side. Please send your last message again.',
    'notify.submitted':
      'Your visit request has been submitted.\nReference: {ref}\nStatus: Pending host approval.\nYou will be notified here once your host responds.',
    'notify.approved':
      'Your visit has been approved.\nReference: {ref}\nHost: {host}\nDate: {date}\nTime: {time}\nLocation: {location}{pinLine}\n\nShow this QR code at the security gate. If it cannot be scanned, give the PIN instead.',
    'notify.pinLine': '\nBackup PIN: {pin}',
    'notify.rejected':
      'We are sorry, your visit request {ref} for {date} was declined by the host. Send Hi if you would like to make a new request.',
  },
  tn: {
    welcome:
      'Re a go amogela mo Botho Innovations Visitor Management System. Tsweetswee re romelele dintlha tsa gago (Maina, Kompone, Maikaelelo, Letlha la ketelo, Nako).',
    'ask.name': 'Tsweetswee re neele maina a gago otlhe.',
    'ask.company': 'O tswa kwa kompone efe?',
    'ask.purpose': 'Maikaelelo a ketelo ya gago ke eng?',
    'ask.host': 'O batla go etela mang? Tsweetswee kwala leina la motho kgotsa la lefapha.',
    'ask.date': 'O batla go etela ka letlha lefe? Sekai: 25 Lwetse, kgotsa kamoso.',
    'ask.time': 'O tla goroga ka nako mang? Sekai: 10am, kgotsa 15:00.',
    'retry.name': 'Tsweetswee romela maina a gago otlhe jaaka a tshwanetse go tswa mo pasong, sekai: Michael Ntsima.',
    'retry.company': 'Tsweetswee romela leina la kompone ya gago. Fa e le ketelo ya sebele, araba o re: Personal.',
    'retry.purpose': 'Tsweetswee mpolelele ka bokhutshwane gore o tla ka ntlha ya eng, sekai: Kopano ya thekiso.',
    'retry.date': 'Ga ke a tlhaloganya letlha leo. Tsweetswee le romele jaaka 25 Lwetse, 25/09/2026, kgotsa kamoso.',
    'retry.time': 'Ga ke a tlhaloganya nako eo. Tsweetswee e romele jaaka 10am, 3:30pm, kgotsa 15:00.',
    'date.past': 'Letlha leo le setse le fetile. Tsweetswee romela letlha la gompieno kgotsa le le tlang.',
    'host.none': 'Ga ke na motho kgotsa lefapha le le bidiwang "{query}". Tsweetswee tlhopha mo lenaaneng le, o arabe ka nomoro:',
    'host.none.again': 'Seo ga se tsamaisane le ope mo lenaaneng. Tsweetswee araba ka nomoro, kgotsa kwala leina jaaka le kwadilwe:',
    'host.many': 'Go na le batho ba feta bongwe ba ba tsamaisanang le "{query}". Tsweetswee araba ka nomoro ya motho yo o mo etelang:',
    'host.pick': 'Tsweetswee tlhopha motho yo o mo etelang, o arabe ka nomoro:',
    'host.directoryEmpty':
      'Lenaane la batho ba ba etelwang ga le ise le baakanngwe, ka jalo ga ke kgone go wetsa kopo ka WhatsApp jaanong. Tsweetswee ikgolaganye le kamogelo.',
    'label.name': 'Maina',
    'label.company': 'Kompone',
    'label.purpose': 'Maikaelelo',
    'label.host': 'O etela',
    'label.date': 'Letlha',
    'label.time': 'Nako',
    confirm: 'Tsweetswee tlhomamisa dintlha tsa ketelo ya gago:\n{summary}\n\nAraba EE go romela kopo, kgotsa mpolelele se o batlang go se fetola.',
    'confirm.reminder': 'Araba EE go romela kopo e, kgotsa mpolelele se o batlang go se fetola (sekai: nako 11am).',
    'confirm.change': 'Go siame. O batla go fetola eng? Sekai: nako 11am, kgotsa letlha 26 Lwetse.',
    submitted:
      'Kopo ya gago ya ketelo e rometswe.\nNomoro ya tshupo: {ref}\nO etela: {host}\nLetlha: {date} ka {time}\n\nO tla amogela kitsiso fano fa ketelo ya gago e amogetswe kgotsa e ganetswe.',
    'book.failed': 'Maswabi, ga ke a kgona go romela kopo ya gago jaanong. Tsweetswee araba EE go leka gape.',
    'book.hostGone': 'Motho yoo ga a sa le teng mo lenaaneng. Tsweetswee tlhopha yo mongwe, o arabe ka nomoro:',
    cancelled: 'Kopo ya gago e khanseletswe. Romela Dumela fa o batla go simolola kopo e ntšhwa.',
    'status.header': 'Nomoro ya tshupo: {ref}\nO etela: {host}\nLetlha: {date} ka {time}\nMaemo: {status}',
    'status.notFound':
      'Ga ke a bona ketelo e e nang le nomoro ya tshupo {ref} mo nomorong e. Tsweetswee tlhola nomoro o bo o leke gape.',
    'status.pending': 'E emetse go amogelwa ke yo o mo etelang',
    'status.approved': 'E amogetswe',
    'status.rejected': 'E ganetswe',
    'status.used': 'O setse o tsene',
    'status.blocked': 'E thibetswe',
    offTopic: 'Nka go thusa fela ka dikopo tsa diketelo le tshedimosetso ya diketelo kwa Botho Innovations.',
    approveDenied:
      'Diketelo ga di amogelwe kgotsa go ganwa mo puisanong e. Yo o mo etelang o tla amogela kgotsa a gane kopo ya gago, mme o tla itsisiwe fano.',
    'faq.fallback': 'Ga ke na tshedimosetso eo. Tsweetswee botsa kwa kamogelong fa o goroga.',
    'faq.startBooking': 'Go dira kopo ya ketelo, romela dintlha tsa gago (Maina, Kompone, Maikaelelo, Letlha la ketelo, Nako).',
    textOnly: 'Ke kgona go bala melaetsa ya mafoko fela.',
    'visit.summary': '{ref}, o etela {host}, {date} ka {time}. Maemo: {status}.',
    'visit.latest': 'Kopo ya gago ya bofelo: {summary}',
    'welcome.existing': 'O setse o na le kopo ya ketelo: {summary}\nFa o batla go dira kopo e nngwe, romela dintlha tsa gago.',
    'thanks.idle': 'Ke itumetse. Romela Dumela fa o batla go dira kopo e nngwe ya ketelo.',
    'thanks.busy': 'Ke itumetse.',
    error: 'Maswabi, go na le bothata ka fa go rona. Tsweetswee romela molaetsa wa gago gape.',
    'notify.submitted':
      'Kopo ya gago ya ketelo e rometswe.\nNomoro ya tshupo: {ref}\nMaemo: E emetse go amogelwa.\nO tla itsisiwe fano fa yo o mo etelang a sena go araba.',
    'notify.approved':
      'Ketelo ya gago e amogetswe.\nNomoro ya tshupo: {ref}\nO etela: {host}\nLetlha: {date}\nNako: {time}\nLefelo: {location}{pinLine}\n\nBontsha QR code e kwa kgorong ya tshireletso. Fa e sa kgone go balwa, neela PIN.',
    'notify.pinLine': '\nPIN ya tlaleletso: {pin}',
    'notify.rejected':
      'Maswabi, kopo ya gago ya ketelo {ref} ya {date} e ganetswe ke yo o neng o batla go mo etela. Romela Dumela fa o batla go dira kopo e ntšhwa.',
  },
};

export function t(lang, key, vars = {}) {
  const table = CATALOG[normalizeLang(lang)];
  const template = table[key] ?? CATALOG.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])));
}

export function hostOptionLines(hosts = []) {
  return hosts
    .map((h, i) => {
      const dept = h.department && h.department !== '—' ? ` (${h.department})` : '';
      return `${i + 1}. ${h.name}${dept}`;
    })
    .join('\n');
}

export function summaryText(slots, lang = 'en') {
  const dept = slots.hostDept && slots.hostDept !== '—' ? ` (${slots.hostDept})` : '';
  return [
    `${t(lang, 'label.name')}: ${slots.name}`,
    `${t(lang, 'label.company')}: ${slots.company}`,
    `${t(lang, 'label.purpose')}: ${slots.purpose}`,
    `${t(lang, 'label.host')}: ${slots.hostName}${dept}`,
    `${t(lang, 'label.date')}: ${formatVisitDate(slots.date, lang)}`,
    `${t(lang, 'label.time')}: ${formatVisitTime(slots.time, lang)}`,
  ].join('\n');
}

export function statusLabel(status, lang = 'en') {
  const key = `status.${status}`;
  const value = t(lang, key);
  return value === key ? status : value;
}

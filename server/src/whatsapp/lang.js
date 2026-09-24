// Language handling for the visitor chat. Only English ('en') and Setswana ('tn') are supported.

const TN_STRONG = new Set([
  'dumela', 'dumelang', 'tsweetswee', 'tswee', 'leina', 'maina', 'kompone', 'maikaelelo', 'letlha', 'nako',
  'batla', 'etela', 'ketelo', 'gompieno', 'kamoso', 'nnyaa', 'siame', 'leboga', 'lefapha', 'tswa', 'kwa',
  'rra', 'mma', 'gago', 'nna', 'ntse', 'kae', 'mosong', 'motshegare', 'tshokologo', 'maitseboeng', 'ee', 'eya',
  'ke', 'kea', 'rona', 'bona', 'kopano', 'tlhomamisa', 'fetola', 'romela', 'kopa', 'thusa', 'jang', 'eng',
  'lwetse', 'setemere', 'mosupologo', 'labobedi', 'laboraro', 'labone', 'labotlhano', 'lamatlhatso', 'tshipi',
  'teng', 'tlaa', 'tla', 'moeti', 'tsena', 'gape', 'jaanong', 'mme', 'fela', 'sentle', 'khansela',
]);

const TN_WEAK = new Set(['go', 'le', 'ka', 'ya', 'wa', 'sa', 'tsa', 'ba', 'me', 'mo', 'ko', 'a', 'o', 'se']);

const EN_WORDS = new Set([
  'i', 'im', "i'm", 'my', 'the', 'want', 'would', 'like', 'visit', 'visiting', 'from', 'name', 'is', 'am', 'are',
  'meeting', 'please', 'yes', 'no', 'company', 'tomorrow', 'today', 'and', 'to', 'with', 'at', 'on', 'hello', 'hi',
  'hey', 'thanks', 'thank', 'you', 'of', 'for', 'see', 'meet', 'book', 'booking', 'appointment', 'what', 'who',
  'when', 'where', 'how', 'can', 'will', 'need', 'about', 'purpose', 'time', 'date', 'ok', 'okay', 'sure',
  'good', 'morning', 'afternoon', 'evening', 'this', 'that', 'it', 'we', 'our', 'your', 'here', 'there',
]);

function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Returns 'en', 'tn', or null when the message carries no language signal (names, numbers, departments).
export function detectLanguage(text) {
  const tokens = words(text);
  if (!tokens.length) return null;
  let tn = 0;
  let en = 0;
  for (const t of tokens) {
    if (TN_STRONG.has(t)) tn += 2;
    else if (TN_WEAK.has(t)) tn += 0.5;
    if (EN_WORDS.has(t)) en += 1;
  }
  if (tn >= 2 && tn > en) return 'tn';
  if (en >= 1 && en >= tn) return 'en';
  return null;
}

function clean(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GREETING_RE =
  /^(hi+|hello+|hey+|hallo|helo|howdy|greetings|good (morning|afternoon|evening|day)|salam|salaam|assalam|dumela+|dumelang|o kae|le kae|dumela o kae|dumelang le kae)( (there|all|team|rra|mma|borra|bomma|botho|botho innovations|sir|madam))*( (how are you|o kae|le kae))?$/;

export function isGreetingOnly(text) {
  const value = clean(text);
  return Boolean(value) && GREETING_RE.test(value);
}

export function isNewBooking(text) {
  return /\b(another booking|new booking|new visit|another visit|book again|start over|start again|restart|reset|fresh booking|new request|kopo e ntsha|kopo e ntšhwa|ketelo e nngwe|ketelo e ntsha|simolola sesha|simolola gape)\b/i.test(
    String(text || '')
  );
}

export function isCancel(text) {
  return /^(cancel|cancel it|cancel booking|cancel my booking|stop|khansela|emisa|emisa kopo)[.!]*$/i.test(String(text || '').trim());
}

export function isYes(text) {
  const value = clean(text);
  return /^(yes|y|yeah|yea|yep|yup|ya|ok|okay|k|sure|correct|confirm|confirmed|submit|proceed|go ahead|book it|book|please do|yes please|yes submit|yes confirm|that is correct|thats correct|all correct|perfect|ee|eya|ee rra|ee mma|eya rra|eya mma|go siame|siame|tlhomamisa|ke tlhomamisa|romela|ee romela|ee tlhomamisa|ke a dumela)( (thanks|thank you|please|rra|mma))?$/.test(
    value
  );
}

export function isNo(text) {
  const value = clean(text);
  return /^(no|nope|nah|n|not correct|thats wrong|that is wrong|wrong|change|edit|i want to change|change it|nnyaa|nnya|fetola|ga go a siama|ke batla go fetola)( (please|rra|mma|thanks))?$/.test(
    value
  );
}

export function looksLikeQuestion(text) {
  const value = String(text || '').trim().toLowerCase();
  return (
    value.includes('?') ||
    /^(what|where|when|who|whom|which|why|how|can|could|do|does|did|is|are|will|would|should|may i)\b/.test(value) ||
    /^(a o|a le|a go|a ke|ke eng|ke kae|ke leng|jang|bokae|goreng|ke mang)\b/.test(value)
  );
}

export function isOffTopic(text) {
  const value = String(text || '');
  return (
    /(?:^|[^a-z])c\+\+|c#/i.test(value) ||
    /\b(javascript|python|java|html|css|write (me )?(a |some )?code|source code|programming|program in|homework|assignment|essay|leetcode|algorithm|sql query|poem|joke|bitcoin|crypto)\b/i.test(value)
  );
}

// A visitor typing an approval command, e.g. "approve" or "please approve it". Status questions are not commands.
export function mentionsDecision(text) {
  const value = String(text || '').trim().toLowerCase();
  if (looksLikeQuestion(value)) return false;
  return /^(yes[, ]+|please |pls )?(approve|reject|decline)\b/.test(value);
}

export function normalizeLang(lang) {
  return lang === 'tn' ? 'tn' : 'en';
}

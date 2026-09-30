// Pure host/department matching against the saved directory. Never invents a host.

const STOP = new Set([
  'department', 'dept', 'the', 'to', 'visit', 'visiting', 'see', 'seeing', 'meet', 'meeting', 'with', 'mr', 'mrs',
  'ms', 'miss', 'dr', 'prof', 'rra', 'mma', 'host', 'is', 'office', 'lefapha', 'la', 'go', 'etela', 'bona', 'ke',
  'batla', 'i', 'want', 'would', 'like', 'a', 'an', 'of', 'in', 'my', 'please', 'name', 'section', 'team', 'unit',
  'person', 'someone', 'from', 'at', 'for', 'and', 'tsweetswee', 'kopana', 'le', 'mo', 'kwa', 'ka', 'na', 'yo',
  'on', 'called', 'named', 'sir', 'madam',
]);

const ALIASES = { hr: 'human resources', it: 'information technology', ict: 'information technology' };

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return normalizeText(value).split(' ').filter(Boolean);
}

function queryTokens(query) {
  return tokens(query)
    .flatMap((tok) => (ALIASES[tok] ? ALIASES[tok].split(' ') : [tok]))
    .filter((tok) => !STOP.has(tok));
}

function hasPhrase(haystack, phrase) {
  return Boolean(phrase) && ` ${haystack} `.includes(` ${phrase} `);
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function fuzzyHit(qTok, targetTokens) {
  if (qTok.length < 4) return false;
  return targetTokens.some(
    (tt) => (tt.length >= 4 && (tt.startsWith(qTok) || qTok.startsWith(tt))) || (qTok.length >= 5 && distance(qTok, tt) <= 1)
  );
}

export function departmentOf(host) {
  const dept = String(host?.department || '').trim();
  return dept && dept !== '—' && dept !== '-' ? dept : '';
}

function scoreHost(qTokens, host) {
  const q = qTokens.join(' ');
  const name = normalizeText(host.name);
  const dept = normalizeText(departmentOf(host));
  const nameToks = name.split(' ').filter(Boolean);
  const deptToks = dept.split(' ').filter(Boolean);

  if (q === name) return 100;
  if (dept && q === dept) return 95;

  const nameHits = nameToks.filter((tok) => tok.length >= 2 && qTokens.includes(tok)).length;
  if (nameHits && nameHits === nameToks.length) return 80 + nameHits * 3;
  const deptHits = deptToks.filter((tok) => tok.length >= 2 && qTokens.includes(tok)).length;
  if (deptHits && deptHits === deptToks.length && hasPhrase(q, dept)) return 75 + deptHits * 3;
  if (nameHits) return 60 + nameHits * 3;
  if (deptHits) return 50 + deptHits * 3;

  if (qTokens.some((tok) => fuzzyHit(tok, nameToks))) return 42;
  if (qTokens.some((tok) => fuzzyHit(tok, deptToks))) return 40;
  return 0;
}

// Below this score a match came only from a partial or fuzzy hit and must be confirmed by the visitor.
export const CONFIDENT_SCORE = 60;

// Returns the best-scoring hosts and their score. One host = a single match; several = the visitor must choose.
export function bestHostMatches(query, hosts = []) {
  const qTokens = queryTokens(query);
  if (!qTokens.length) return { hosts: [], score: 0 };
  const scored = hosts
    .filter((h) => h && h.name && (h.status === undefined || h.status === 'active'))
    .map((host) => ({ host, score: scoreHost(qTokens, host) }))
    .filter((item) => item.score > 0);
  if (!scored.length) return { hosts: [], score: 0 };
  const top = Math.max(...scored.map((item) => item.score));
  return { hosts: scored.filter((item) => item.score === top).map((item) => item.host), score: top };
}

export function matchHosts(query, hosts = []) {
  return bestHostMatches(query, hosts).hosts;
}

// Picks an option by its list number ("2", "no. 2", "option 2"). Returns null when the reply is not a number.
export function pickNumber(text, options = []) {
  const num = String(text || '').trim().match(/^(?:no\.?|number|option|nomoro)?\s*(\d{1,2})[.)]?$/i);
  if (!num) return null;
  const option = options[Number(num[1]) - 1];
  return option ? [option] : [];
}

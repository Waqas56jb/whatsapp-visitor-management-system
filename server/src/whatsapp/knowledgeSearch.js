// Finds the passages of the company knowledge (websites, files, pasted text, rules, Q&A) that are
// relevant to a visitor's question. Pure; used to ground the AI and as a no-AI fallback.

const STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'you', 'your', 'our', 'with', 'this', 'that', 'what', 'when', 'where',
  'which', 'who', 'how', 'why', 'can', 'could', 'will', 'would', 'should', 'have', 'has', 'had', 'from', 'into', 'about',
  'there', 'their', 'them', 'they', 'then', 'than', 'but', 'not', 'any', 'all', 'does', 'did', 'doing', 'tell', 'please',
  'know', 'want', 'need', 'get', 'got', 'its', 'also', 'more', 'some', 'here', 'just', 'like', 'much', 'many', 'very',
  'yes', 'let', 'give', 'show', 'botho', 'innovations', 'company', 'is', 'do', 'me', 'my', 'it', 'of', 'to', 'in', 'on',
  'a', 'an', 'or', 'be', 'if', 'at', 'by', 'as', 'we', 'us', 'i', 'ke', 'go', 'le', 'ya', 'wa', 'ka', 'mo', 'a', 'o',
]);

export function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function stem(word) {
  return word.replace(/(ings?|edly|ed|es|s)$/, '') || word;
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

// Website navigation and widget text that is never an answer.
const BOILERPLATE =
  /\b(skip to content|menu close|read more\s*>*|click to expand|see more|subscribe|newsletter signup|cookie(s)? policy|all rights reserved|back to top)\b|✕|&copy;|©/gi;

// Line breaks are kept: in PDFs they separate headings and running headers from the prose.
export function cleanText(text) {
  return decodeEntities(text).replace(BOILERPLATE, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

const MINOR_WORDS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'for', 'to', 'with', 'by', 'at', '&']);

// Up to 8 words, no sentence punctuation, and mostly Capitalised (minor words ignored).
function isHeadingLine(line) {
  const words = line.trim().split(/\s+/);
  if (words.length > 8 || /[.!?,;:]["”’)]?$/.test(line.trim()) || /^[a-z(]/.test(line.trim())) return false;
  const major = words.filter((w) => !MINOR_WORDS.has(w.toLowerCase()) && /^[A-Za-z]/.test(w));
  if (!major.length) return true; // page numbers and stray figures on their own line
  return major.filter((w) => /^[A-Z]/.test(w)).length / major.length >= 0.75;
}

// Table-of-contents lines, headings with page numbers, counters ("0 Kilometres of Fibre") and
// menus read like text but never answer anything.
export function isJunkSentence(sentence) {
  const s = sentence.trim();
  const words = s.split(/\s+/);
  // "Our Business Model 10", "Governance Framework 42": contents lines ending in a page number.
  if (words.length <= 12 && /\s\d{1,3}$/.test(s) && !/[.!?]\s/.test(s)) return true;
  // Headings and running headers without a sentence ("OUR PURPOSE, VISION and VALUES", "Integrated Report 2025").
  if (isHeadingLine(s) || (words.length <= 8 && /^[A-Z0-9 ,&'’-]+$/.test(s))) return true;
  const numbers = words.filter((w) => /^\d+$/.test(w)).length;
  if (numbers >= 3 && numbers / words.length > 0.08) return true;
  if (/\b0\s+(kilometres|km|bandwidth|capacity|utili[sz]ation)\b/i.test(s)) return true;
  const letters = words.filter((w) => /^[A-Za-z]/.test(w));
  const capital = letters.filter((w) => /^[A-Z]/.test(w)).length;
  if (letters.length >= 8 && capital / letters.length > 0.7 && !/[.!?]$/.test(s)) return true;
  return false;
}

// Rebuilds sentences from PDF/web lines: heading-like lines stand alone, while prose lines that
// wrap mid-sentence are joined back together before splitting on sentence punctuation.
function rawSentences(text) {
  const units = [];
  let buffer = '';
  for (const line of cleanText(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    // Headings and running headers ("Our Values", "Combined Assurance") always stand alone. A short
    // prose line that wraps ("The annual financial statements have been") continues its sentence.
    const heading = isHeadingLine(line);
    if (heading) {
      if (buffer) units.push(buffer);
      buffer = '';
      units.push(line);
      continue;
    }
    buffer = buffer ? `${buffer} ${line}` : line;
    if (/[.!?]["”’)]?$/.test(line)) {
      units.push(buffer);
      buffer = '';
    }
  }
  if (buffer) units.push(buffer);
  return units
    .flatMap((u) => u.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

// Sentences fit to quote on their own (tables, contents lines and headings removed).
function splitSentences(text) {
  return rawSentences(text).filter((s) => !isJunkSentence(s));
}

// Knowledge rows → ~700-character passages, each remembering where it came from.
export function buildChunks(rows = [], size = 700) {
  const chunks = [];
  for (const row of rows) {
    const source = row.title || row.question || row.kind || 'Company knowledge';
    const body = row.kind === 'qa' ? `${row.question || row.title || ''} ${row.answer || ''}` : row.answer || '';
    let current = '';
    // Passages keep tables and figures (the AI can read them); quoting filters junk later.
    for (const sentence of rawSentences(body)) {
      if (current && current.length + sentence.length > size) {
        chunks.push({ source, kind: row.kind, text: current.trim() });
        current = '';
      }
      current += `${sentence}\n`;
    }
    if (current.trim()) chunks.push({ source, kind: row.kind, text: current.trim() });
  }
  return chunks.map((c) => ({ ...c, tokens: tokenize(`${c.source} ${c.text}`) }));
}

// Ranks passages by how many of the question's words they contain, weighting rare words higher.
export function searchKnowledge(question, chunks, limit = 5) {
  const q = [...new Set(tokenize(question))];
  if (!q.length || !chunks.length) return [];
  const df = new Map(q.map((w) => [w, chunks.filter((c) => c.tokens.includes(w)).length]));
  const words = String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  const phrase = words.length && words.length <= 4 ? words.join(' ') : '';
  return chunks
    .map((c) => {
      let score = 0;
      for (const w of q) {
        const tf = c.tokens.filter((x) => x === w).length;
        if (tf) score += Math.log(1 + chunks.length / (df.get(w) || 1)) * (1 + 0.3 * Math.log(tf));
      }
      const matched = q.filter((w) => c.tokens.includes(w)).length;
      // The asked words as a whole phrase, or as a section heading ("VISION and VALUES"), are the
      // strongest signal for short questions.
      if (phrase && score > 0) {
        if (new RegExp(`\\b${phrase}\\b`, 'i').test(c.text)) score += 1;
        if (new RegExp(`\\b${phrase.toUpperCase()}\\b`).test(c.text)) score += 2;
      }
      return { ...c, score, matched };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// "BoFiNet is…", "BoFiNet operates as…", "…, BoFiNet provides…": the subject itself doing the defining.
export function isDefinition(sentence, subject) {
  const s = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${s}\\b(?:’s|'s)?\\s+(?:is|are|was|operates|provides|offers|means|stands for|refers to|exists to|serves|delivers)\\b`, 'i').test(sentence);
}

const DEFINING_NOUNS = /\b(provider|company|organisation|organization|entity|enterprise|network|operator|authority|agency|business|firm|institution|parastatal|body)\b/i;

// The best sentence that defines the subject of a "what is X" question, across the top passages.
export function bestDefinition(question, chunks) {
  const subject = definitionSubject(question);
  if (!subject) return null;
  let best = null;
  for (const hit of chunks) {
    for (const s of rawSentences(hit.text).filter((x) => !isJunkSentence(x))) {
      if (!isDefinition(s, subject)) continue;
      const score = (DEFINING_NOUNS.test(s) ? 3 : 0) + (s.length < 260 ? 1 : 0) + (/\b(is|operates as)\s+(a|an|the|more than)\b/i.test(s) ? 1 : 0);
      if (!best || score > best.score) best = { text: s, source: hit.source, score };
    }
  }
  return best;
}

export function definitionSubject(question) {
  return String(question || '').toLowerCase().match(/\b(?:what|who)\s+(?:is|are|was)\s+(?:a |an |the )?([a-z0-9][a-z0-9 .&-]{1,40}?)\s*(?:and\b.*)?\??$/)?.[1] || null;
}

// Short questions that name a document section ("values", "vision", "our mission") are answered
// with the sentences directly under the most specific matching heading ("Our Values").
export function sectionAnswer(question, rows = []) {
  const value = String(question || '').trim().toLowerCase();
  // Only bare section names: "values", "our vision", "what is their mission" — not who/how/where questions.
  if (/\b(who|how|when|where|why|which|many|much)\b/.test(value)) return null;
  const q = [...new Set(tokenize(question))];
  if (!q.length || q.length > 2) return null;
  let best = null;
  for (const row of rows) {
    const units = rawSentences(row.kind === 'qa' ? `${row.question || ''}\n${row.answer || ''}` : row.answer || '');
    units.forEach((unit, i) => {
      if (unit.split(/\s+/).length > 4) return;
      if (!isHeadingLine(unit) && !/^[A-Z0-9 ,&'’-]+$/.test(unit)) return;
      const headingTokens = tokenize(unit);
      if (!q.every((w) => headingTokens.includes(w))) return;
      const extra = headingTokens.length - q.length;
      if (extra > 1) return;
      const body = [];
      for (let j = i + 1; j < units.length && body.length < 2; j += 1) {
        if (isHeadingLine(units[j]) && body.length) break;
        const u = units[j];
        if (!isJunkSentence(u) && (/[.!?]["”’)]?$/.test(u) || u.length >= 60)) body.push(u);
      }
      if (!body.length) return;
      if (!best || extra < best.extra) best = { text: body.join(' '), source: row.title || row.question || 'Company knowledge', extra };
    });
  }
  return best;
}

// The one or two sentences of a passage that best answer the question.
// For "what is X" questions, sentences that define X ("X is…", "X provides…") are preferred.
export function bestSnippet(question, chunk, max = 2) {
  return bestSnippetScored(question, chunk, max).text;
}

export function bestSnippetScored(question, chunk, max = 2) {
  const q = new Set(tokenize(question));
  const subject = definitionSubject(question);
  const wantsNumber = /\b(how (many|much|big|large|long|fast)|number of|revenue|profit|capacity|size|cost|price|fees?)\b/i.test(question);
  // Table lines are normally skipped, but a line with the asked-about word and a real figure
  // ("TOTAL REVENUE P376 million", "206Gbps") is exactly the answer.
  const FIGURE = /\b(P\s?\d[\d,.]*|\d[\d,.]*\s?(million|billion|thousand|%|percent|km|kilometres|gbps|mbps|tbps))\b/i;
  const ranked = rawSentences(chunk.text)
    .filter((s) => !isJunkSentence(s) || (FIGURE.test(s) && tokenize(s).some((w) => q.has(w))))
    .map((s, i) => {
      const lower = s.toLowerCase();
      let hits = new Set(tokenize(s).filter((w) => q.has(w))).size;
      if (subject && isDefinition(lower, subject)) hits += 3;
      // "How many / how much" questions want the sentence that carries the number.
      if (wantsNumber && /\d/.test(s) && hits > 0) hits += /^to\b|\b(aim|target|goal|plan)s?\b/i.test(s) ? 1 : 2;
      // Fragments ("Employee Engagement,") are never a good answer.
      if (!/[.!?]["”’)]?$/.test(s) && s.length < 60) hits -= 2;
      if (s.length > 400) hits -= 1;
      return { s, i, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.i - b.i);
  if (!ranked.length) return { text: '', score: 0 };
  // A second sentence only when it is nearly as relevant as the best one.
  const text = ranked
    .filter((x, idx) => idx === 0 || (idx < max && x.hits >= ranked[0].hits * 0.75))
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(' ');
  return { text, score: ranked[0].hits };
}

// True when the message's meaningful words appear in the company knowledge — used to tell a
// follow-up question ("values", "data centre") apart from a booking answer ("Michael Ntsima").
export function knowsAbout(text, chunks) {
  const words = [...new Set(tokenize(text))];
  if (!words.length || !chunks.length) return false;
  const found = words.filter((w) => chunks.some((c) => c.tokens.includes(w))).length;
  return found / words.length >= 0.5;
}

// Search that keeps the conversation's topic: a vague follow-up ("how much is a company?") is
// searched together with the previous questions, but passages matching the new words rank first.
const ANAPHORA = /\b(it|its|they|their|them|that|this|those|these|he|she|his|her|there)\b|^(and|also|what about|how about|so)\b/i;

// The topic is only borrowed when the question depends on it. A question about something the
// knowledge does not mention at all ("what is cipa" after it was removed) must not be answered
// from an older topic.
export function searchWithTopic(question, chunks, topics = [], limit = 6) {
  const direct = searchKnowledge(question, chunks, limit);
  const topicText = topics.filter(Boolean).slice(-2).join(' ');
  const qTokens = [...new Set(tokenize(question))];
  if (!topicText || !chunks.length) return direct;
  const unknown = qTokens.filter((w) => !chunks.some((c) => c.tokens.includes(w)));
  if (unknown.length && !ANAPHORA.test(question)) return direct;
  const vague = qTokens.length <= 2 || ANAPHORA.test(question);
  if (!vague && direct.length) return direct;

  // Rank by the new question's own words first; the topic only breaks ties and fills gaps.
  const topical = searchKnowledge(`${question} ${topicText}`, chunks, limit * 2);
  const byText = new Map();
  for (const c of [...topical, ...direct]) {
    const own = qTokens.filter((t) => c.tokens.includes(t)).length;
    const directScore = direct.find((d) => d.text === c.text)?.score || 0;
    const rank = directScore * 3 + c.score * 0.5 + own * 2;
    const prev = byText.get(c.text);
    if (!prev || prev.rank < rank) byText.set(c.text, { ...c, rank, matched: Math.max(c.matched, own) });
  }
  return [...byText.values()].sort((a, b) => b.rank - a.rank).slice(0, limit);
}

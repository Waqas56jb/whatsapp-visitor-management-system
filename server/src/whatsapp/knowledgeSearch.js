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

function splitSentences(text) {
  return decodeEntities(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

// Knowledge rows → ~700-character passages, each remembering where it came from.
export function buildChunks(rows = [], size = 700) {
  const chunks = [];
  for (const row of rows) {
    const source = row.title || row.question || row.kind || 'Company knowledge';
    const body = row.kind === 'qa' ? `${row.question || row.title || ''} ${row.answer || ''}` : row.answer || '';
    let current = '';
    for (const sentence of splitSentences(body)) {
      if (current && current.length + sentence.length > size) {
        chunks.push({ source, kind: row.kind, text: current.trim() });
        current = '';
      }
      current += `${sentence} `;
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
  return chunks
    .map((c) => {
      let score = 0;
      for (const w of q) if (c.tokens.includes(w)) score += Math.log(1 + chunks.length / (df.get(w) || 1));
      const matched = q.filter((w) => c.tokens.includes(w)).length;
      return { ...c, score, matched };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// The one or two sentences of a passage that best answer the question.
export function bestSnippet(question, chunk, max = 2) {
  const q = new Set(tokenize(question));
  return splitSentences(chunk.text)
    .map((s, i) => ({ s, i, hits: tokenize(s).filter((w) => q.has(w)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s)
    .join(' ');
}

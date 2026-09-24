import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  bestDefinition,
  bestSnippet,
  buildChunks,
  knowsAbout,
  searchWithTopic,
  sectionAnswer,
} from '../src/whatsapp/knowledgeSearch.js';

// Shaped like the real PDF: running headers, a contents page, headings, wrapped prose lines.
const REPORT = {
  kind: 'document',
  title: 'report.pdf',
  answer: [
    'Acme Fibre Integrated Report 2025',
    'Powering Digital Growth',
    'Our Business Model 10',
    'Governance Framework 42',
    'External Auditor 49',
    'OUR PURPOSE, VISION and VALUES',
    'Acme operates as a wholesale provider and serves all',
    'licensed operators in the country.',
    'Acme is more than a network provider.',
    'Our Values',
    'Acme is underpinned by three principles that deliver',
    'superior value to our customers. We treat people with respect.',
    'Our Vision',
    'We aim to have “Connected communities everywhere.”',
    'Combined Assurance',
    'The annual financial statements have been',
    'independently audited by our external auditors KPMG.',
    'TOTAL REVENUE',
    'Acme achieved revenue of P376 million (FY2024: P485 million) this year.',
    'The data centre will unlock new revenue streams for revenue diversification.',
    'Our People',
    'Our 256 employees are central to our strategy.',
  ].join('\n'),
};
const WEBSITE = {
  kind: 'website',
  title: 'www.acme.co.bw',
  answer: 'Skip to content Menu Close Home About Read More &#8211; Acme is a consortium member of two cable systems.',
};
const ROWS = [REPORT, WEBSITE];
const CHUNKS = buildChunks(ROWS);

function answer(question, topics = []) {
  const hits = searchWithTopic(question, CHUNKS, topics, 8);
  return bestSnippet(question, hits[0] || { text: '' });
}

describe('knowledge search', () => {
  test('definitions prefer "X is a … provider" over other "X is" sentences', () => {
    assert.match(bestDefinition('What is Acme', CHUNKS).text, /^Acme (operates as a wholesale provider|is more than a network provider)/);
  });

  test('section questions return the text under the matching heading', () => {
    assert.match(sectionAnswer('Values', ROWS).text, /^Acme is underpinned by three principles/);
    assert.match(sectionAnswer('what is their vision', ROWS).text, /Connected communities everywhere/);
    assert.equal(sectionAnswer('who audits them', ROWS), null);
  });

  test('wrapped PDF lines are rebuilt into whole sentences', () => {
    assert.match(answer('who audits them'), /^The annual financial statements have been independently audited by our external auditors KPMG\.$/);
  });

  test('"how much" questions get the sentence with the figure', () => {
    const hits = searchWithTopic('how much revenue did they make', CHUNKS, [], 8);
    const best = hits.map((h) => bestSnippet('how much revenue did they make', h)).find(Boolean);
    assert.match(best, /P376 million/);
  });

  test('contents lines, headings and website menus are never quoted', () => {
    for (const q of ['governance framework', 'business model', 'external auditor', 'home about']) {
      const text = answer(q);
      assert.doesNotMatch(text, /\b(10|42|49)$|Skip to content|Read More|Integrated Report 2025/);
    }
    assert.doesNotMatch(CHUNKS.map((c) => c.text).join(' '), /&#8211;|Skip to content/);
  });

  test('a follow-up keeps the topic, but an unknown subject does not borrow it', () => {
    assert.ok(searchWithTopic('and how many employees?', CHUNKS, ['What is Acme']).length);
    assert.deepEqual(searchWithTopic('What is cipa', CHUNKS, ['What is Acme']), []);
  });

  test('knowsAbout separates knowledge words from names', () => {
    assert.equal(knowsAbout('values', CHUNKS), true);
    assert.equal(knowsAbout('Michael Ntsima', CHUNKS), false);
  });
});

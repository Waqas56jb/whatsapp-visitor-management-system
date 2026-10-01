// Hosts approve or decline visit requests by replying on WhatsApp. Deterministic: no AI.
//
// A decision is only accepted from the phone number registered for the visit's host, and is
// resolved in this order:
//   a. the reply quotes a request notification → that visit;
//   b. the message carries a reference ("approve VMS-2026-123456", "2 VMS-2026-123456");
//   c. "approve 2" after a numbered list → that entry of the list;
//   d. a bare decision ("1", "2", "approve", "no", "ee", …) → the host's only pending request,
//      or a numbered list when there are several.
// Anything else from a host's number is not handled here and goes to the normal visitor flow.
import { Host, Visit } from '../models/index.js';
import { decideVisit } from '../services/visits.js';
import { todayStamp } from '../utils/dateParse.js';
import { formatDate } from '../utils/mappers.js';
import { detectLanguage } from './lang.js';
import { formatVisitDate, formatVisitTime, t } from './messages.js';

const REF_RE = /\bVMS-\d{4}-\d{3,}\b/i;
const LIST_TTL_MS = 2 * 60 * 60 * 1000;

// Words that can only mean a decision, and short answers that could also answer a booking question.
const EXPLICIT = {
  approved: ['approve', 'approved', 'accept', 'accepted', 'amogela', 'ke a amogela', 'ke amogela', 'ke a dumela'],
  rejected: ['reject', 'rejected', 'decline', 'declined', 'deny', 'gana', 'ke a gana', 'ke gana'],
};
const AMBIGUOUS = {
  approved: ['1', 'yes', 'y', 'ee', 'eya', 'ok'],
  rejected: ['2', 'no', 'n', 'nnyaa', 'nnya'],
};

function decisionFor(phrase) {
  for (const decision of ['approved', 'rejected']) {
    if (EXPLICIT[decision].includes(phrase)) return { decision, explicit: true };
    if (AMBIGUOUS[decision].includes(phrase)) return { decision, explicit: false };
  }
  return null;
}

// Reads a host's message as a decision. Returns null when it is not one.
// { decision: 'approved'|'rejected', explicit, ref?, index? }
export function parseDecision(text) {
  const raw = String(text || '').trim();
  const ref = raw.match(REF_RE)?.[0]?.toUpperCase() || null;
  const rest = raw
    .replace(REF_RE, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rest) return null;
  const whole = decisionFor(rest);
  if (whole) return { ...whole, ref };
  // "approve 2" / "decline 1": a decision word followed by a list number.
  const indexed = rest.match(/^(.+?) (\d{1,2})$/);
  if (indexed && !ref) {
    const word = decisionFor(indexed[1]);
    if (word?.explicit) return { ...word, index: Number(indexed[2]) };
  }
  return null;
}

const SETSWANA_DECISIONS = new Set(['amogela', 'ke a amogela', 'ke amogela', 'ke a dumela', 'gana', 'ke a gana', 'ke gana', 'ee', 'eya', 'nnyaa', 'nnya']);

// Reply in Setswana when the host wrote in Setswana, including a bare Setswana decision word.
function langOf(text) {
  const words = String(text || '').replace(/\bVMS-\d{4}-\d{3,}\b/gi, ' ').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const phrase = words.replace(/ \d{1,2}$/, '');
  return SETSWANA_DECISIONS.has(phrase) || detectLanguage(text) === 'tn' ? 'tn' : 'en';
}

function visitVars(visit, lang) {
  return {
    ref: visit.ref_number,
    visitor: visit.visitor_name,
    date: formatVisitDate(formatDate(visit.visit_date), lang),
    time: formatVisitTime(visit.visit_time, lang),
  };
}

function statusText(status, lang) {
  const key = `hostmsg.status.${status}`;
  const value = t(lang, key);
  return value === key ? status : value;
}

const defaults = {
  findHostByPhone: (phone) => Host.findByPhone(phone),
  findVisitByHostMessageId: (id) => Visit.findByHostMessageId(id),
  findVisitByRef: (ref) => Visit.findByRef(ref),
  findVisitById: (id) => Visit.findById(id),
  listPendingForHost: (hostId) => Visit.listPendingForHost(hostId, todayStamp()),
  decide: (args) => decideVisit(args),
  // Is this number in the middle of its own visitor booking, waiting for an answer?
  bookingWaiting: async (phone) => {
    const { bookingWaiting } = await import('./visitorAgent.js');
    return bookingWaiting(phone);
  },
};

// Builds the handler. Tests pass their own data access and reply function.
export function createHostDecisionHandler(overrides = {}) {
  const deps = { ...defaults, ...overrides };
  // The numbered list last sent to each host, so "approve 2" means what they saw.
  const lists = new Map();

  return async function handleHostMessage({ phone, text, quotedId = null, reply }) {
    if (!phone) return false;
    const host = await deps.findHostByPhone(phone);
    if (!host || (host.status && host.status !== 'active')) return false;
    const lang = langOf(text);
    const parsed = parseDecision(text);
    const send = (key, vars) => reply(t(lang, key, vars));

    async function apply(visit, decision) {
      if (Number(visit.host_id) !== Number(host.id)) {
        await send('hostmsg.otherHost', { ref: visit.ref_number });
        return true;
      }
      if (visit.status !== 'pending') {
        await send('hostmsg.already', { ...visitVars(visit, lang), status: statusText(visit.status, lang) });
        return true;
      }
      const result = await deps.decide({ visitId: visit.id, decision, actor: host.name, actorHostId: host.id, via: 'whatsapp' });
      const now = result.visit || visit;
      if (result.alreadyDecided) {
        await send('hostmsg.already', { ...visitVars(now, lang), status: statusText(now.status, lang) });
      } else {
        await send(decision === 'approved' ? 'hostmsg.approvedAck' : 'hostmsg.declinedAck', visitVars(now, lang));
      }
      lists.delete(host.id);
      return true;
    }

    async function sendList(pending) {
      lists.set(host.id, { ids: pending.map((v) => v.id), at: Date.now() });
      const list = pending
        .map((v, i) => {
          const vars = visitVars(v, lang);
          return `${i + 1}. ${vars.visitor} — ${vars.date}, ${vars.time} — ${vars.ref}`;
        })
        .join('\n');
      await send('hostmsg.pendingList', { count: pending.length, list });
      return true;
    }

    // a. A reply quoting one of our request notifications.
    if (quotedId) {
      const quoted = await deps.findVisitByHostMessageId(quotedId);
      if (quoted) {
        if (!parsed) {
          if (Number(quoted.host_id) !== Number(host.id)) return false;
          await send('hostmsg.quotedHint');
          return true;
        }
        return apply(quoted, parsed.decision);
      }
    }
    if (!parsed) return false;

    // b. A reference in the message.
    if (parsed.ref) {
      const visit = await deps.findVisitByRef(parsed.ref);
      if (!visit) {
        await send('hostmsg.refNotFound', { ref: parsed.ref });
        return true;
      }
      return apply(visit, parsed.decision);
    }

    // c. "approve 2" after a numbered list.
    if (parsed.index) {
      const saved = lists.get(host.id);
      if (!saved || Date.now() - saved.at > LIST_TTL_MS) {
        const pending = await deps.listPendingForHost(host.id);
        if (!pending.length) {
          await send('hostmsg.nothingPending');
          return true;
        }
        return sendList(pending);
      }
      const id = saved.ids[parsed.index - 1];
      const visit = id ? await deps.findVisitById(id) : null;
      if (!visit) {
        await send('hostmsg.pickAgain');
        return true;
      }
      return apply(visit, parsed.decision);
    }

    // d. A bare decision. "1", "yes", "no"… answer the host's own booking question first.
    if (!parsed.explicit && (await deps.bookingWaiting(phone))) return false;
    const pending = await deps.listPendingForHost(host.id);
    if (!pending.length) {
      if (!parsed.explicit) return false;
      await send('hostmsg.nothingPending');
      return true;
    }
    if (pending.length === 1) return apply(pending[0], parsed.decision);
    return sendList(pending);
  };
}

export const handleHostMessage = createHostDecisionHandler();

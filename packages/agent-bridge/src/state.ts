import { DOCUMENT_STATES, type DocumentState } from './contracts';

const ALLOWED: Record<DocumentState, DocumentState[]> = {
  received: ['extracting', 'failed', 'rejected'],
  extracting: ['needs_clarification', 'draft', 'failed'],
  needs_clarification: ['draft', 'needs_clarification', 'rejected', 'failed'],
  draft: ['validated', 'needs_clarification', 'rejected', 'failed'],
  validated: ['awaiting_approval', 'draft', 'rejected'],
  awaiting_approval: ['posting', 'validated', 'rejected', 'failed'],
  posting: ['posted', 'failed', 'unknown_outcome'],
  posted: [],
  rejected: [],
  failed: ['received', 'extracting'],
  unknown_outcome: ['posted', 'failed', 'posting'],
};

export function canTransition(from: DocumentState, to: DocumentState): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from: DocumentState, to: DocumentState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal AgentBridge transition ${from} → ${to}.`);
  }
}

export function isTerminal(state: DocumentState): boolean {
  return state === 'posted' || state === 'rejected';
}

export function isKnownState(value: string): value is DocumentState {
  return (DOCUMENT_STATES as readonly string[]).includes(value);
}

import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminal } from '../src/state';

describe('document state machine', () => {
  it('allows the Build1 happy path', () => {
    expect(canTransition('received', 'extracting')).toBe(true);
    expect(canTransition('received', 'awaiting_facts')).toBe(true);
    expect(canTransition('awaiting_facts', 'draft')).toBe(true);
    expect(canTransition('failed', 'awaiting_facts')).toBe(true);
    expect(canTransition('extracting', 'draft')).toBe(true);
    expect(canTransition('draft', 'validated')).toBe(true);
    expect(canTransition('validated', 'awaiting_approval')).toBe(true);
    expect(canTransition('awaiting_approval', 'posting')).toBe(true);
    expect(canTransition('awaiting_approval', 'draft')).toBe(true);
    expect(canTransition('awaiting_approval', 'needs_clarification')).toBe(true);
    expect(canTransition('posting', 'posted')).toBe(true);
  });

  it('forbids posting from draft and rewriting posted bills', () => {
    expect(canTransition('draft', 'posted')).toBe(false);
    expect(canTransition('posted', 'draft')).toBe(false);
    expect(() => assertTransition('posted', 'draft')).toThrow(/Illegal/);
    expect(isTerminal('posted')).toBe(true);
  });
});

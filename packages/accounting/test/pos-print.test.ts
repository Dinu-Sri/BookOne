import { describe, expect, it } from 'vitest';
import {
  normalizePosPrintMode,
  posPrintEffects,
  posPrintModeLabel,
} from '../src/pos-print';

describe('POS print modes', () => {
  it('defaults unknown values to browser without rewriting the stored string in normalize', () => {
    expect(normalizePosPrintMode(undefined)).toBe('browser');
    expect(normalizePosPrintMode('')).toBe('browser');
    expect(normalizePosPrintMode('manual')).toBe('manual');
  });

  it('keeps automatic browser / thermal / both device effects', () => {
    expect(posPrintEffects('browser')).toEqual({
      autoprintReceipt: true,
      thermalReceipt: false,
      autoprintZ: true,
      thermalZ: false,
      kickDrawerOnCash: true,
    });
    expect(posPrintEffects('thermal')).toEqual({
      autoprintReceipt: false,
      thermalReceipt: true,
      autoprintZ: true,
      thermalZ: true,
      kickDrawerOnCash: true,
    });
    expect(posPrintEffects('both')).toEqual({
      autoprintReceipt: true,
      thermalReceipt: true,
      autoprintZ: true,
      thermalZ: true,
      kickDrawerOnCash: true,
    });
  });

  it('manual checkout, refund, and Z-close have zero automatic device effects', () => {
    expect(posPrintEffects('manual')).toEqual({
      autoprintReceipt: false,
      thermalReceipt: false,
      autoprintZ: false,
      thermalZ: false,
      kickDrawerOnCash: false,
    });
  });

  it('labels manual distinctly from browser', () => {
    expect(posPrintModeLabel('manual')).toBe('Manual / preview only');
    expect(posPrintModeLabel('browser')).toBe('Browser');
  });
});

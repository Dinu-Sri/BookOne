import type { ExtractedFacts } from './contracts';
import { caseIdFromHash, GOLDEN_CASES, type GoldenCaseId } from './oracles';

export const FIXTURE_EXTRACTOR_ID = 'fixture:ab-01-corpus';
export const LIVE_EXTRACTOR_ID = 'provider:configurable-ocr';

export type ExtractionResult = {
  extractorId: string;
  model: string;
  promptVersion: string;
  facts: ExtractedFacts;
  live: boolean;
};

export type ExtractionProvider = {
  id: string;
  extract(input: {
    contentHash: string;
    bytes?: Uint8Array;
    mime?: string;
    textHint?: string;
  }): Promise<ExtractionResult>;
};

/** Test-only deterministic extractor. Impossible to mistake for a live provider. */
export const fixtureExtractor: ExtractionProvider = {
  id: FIXTURE_EXTRACTOR_ID,
  async extract(input) {
    const id = caseIdFromHash(input.contentHash);
    const facts = id
      ? { ...GOLDEN_CASES.find((c) => c.id === id)!.facts }
      : inferFromHint(input.textHint);
    if (input.textHint && /ignore previous instructions|switch tenant|approve this/i.test(input.textHint)) {
      facts.rawText = input.textHint;
    }
    return {
      extractorId: FIXTURE_EXTRACTOR_ID,
      model: 'fixture',
      promptVersion: 'ab-01.fixture.v1',
      facts,
      live: false,
    };
  },
};

function inferFromHint(text?: string): ExtractedFacts {
  if (!text) return {};
  const paid = /paid in full|\bpaid\b/i.test(text) ? 'paid' : 'unpaid';
  const stock = /stock|chairs|qty/i.test(text) ? 'stock' : 'service_expense';
  return {
    rawText: text,
    paidStatus: { value: paid, origin: 'inferred' },
    documentKind: { value: stock, origin: 'inferred' },
  };
}

export function liveExtractorFromEnv(env: NodeJS.ProcessEnv = process.env): ExtractionProvider {
  const endpoint = env.AGENT_BRIDGE_OCR_ENDPOINT;
  const key = env.AGENT_BRIDGE_OCR_KEY;
  return {
    id: LIVE_EXTRACTOR_ID,
    async extract() {
      if (!endpoint || !key) {
        const err = new Error('AGENT_BRIDGE_OCR_ENDPOINT and AGENT_BRIDGE_OCR_KEY are not configured.');
        (err as Error & { code: string }).code = 'PROVIDER_UNCONFIGURED';
        throw err;
      }
      throw new Error('Live OCR adapter is configured but the remote smoke is BLOCKED until the owner authorizes uploads.');
    },
  };
}

export function extractorFor(env: NodeJS.ProcessEnv = process.env): ExtractionProvider {
  if (env.AGENT_BRIDGE_EXTRACTOR === 'fixture' || env.NODE_ENV === 'test') return fixtureExtractor;
  return liveExtractorFromEnv(env);
}

export function isFixtureExtractor(id: string): boolean {
  return id === FIXTURE_EXTRACTOR_ID;
}

export function goldenIdFromHash(hash: string): GoldenCaseId | null {
  return caseIdFromHash(hash);
}

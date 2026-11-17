import type { ExtractedFacts } from './contracts';
import { caseIdFromHash, GOLDEN_CASES, type GoldenCaseId } from './oracles';

export const FIXTURE_EXTRACTOR_ID = 'fixture:ab-01-corpus';
export const LIVE_EXTRACTOR_ID = 'provider:configurable-ocr';
export const AGENT_FACTS_EXTRACTOR_ID = 'agent:submitted-facts';
export const MANUAL_FACTS_EXTRACTOR_ID = 'human:manual-facts';

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

const DEFAULT_OCR_TIMEOUT_MS = 8_000;

function providerError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Configurable HTTP OCR adapter. Forwards attachment bytes/MIME. Never fabricates facts. */
export function liveExtractorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): ExtractionProvider {
  const endpoint = env.AGENT_BRIDGE_OCR_ENDPOINT?.trim();
  const key = env.AGENT_BRIDGE_OCR_KEY?.trim();
  const timeoutMs = Number(env.AGENT_BRIDGE_OCR_TIMEOUT_MS ?? DEFAULT_OCR_TIMEOUT_MS);
  return {
    id: LIVE_EXTRACTOR_ID,
    async extract(input) {
      if (!endpoint || !key) {
        throw providerError(
          'AGENT_BRIDGE_OCR_ENDPOINT and AGENT_BRIDGE_OCR_KEY are not configured.',
          'PROVIDER_UNCONFIGURED',
        );
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_OCR_TIMEOUT_MS);
      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': input.mime || 'application/octet-stream',
            'X-Content-Hash': input.contentHash,
            'X-Filename': 'attachment',
          },
          body: input.bytes && input.bytes.byteLength ? Buffer.from(input.bytes) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw providerError(`OCR provider returned HTTP ${res.status}.`, 'EXTRACTION_FAILED');
        }
        const json = (await res.json()) as Record<string, unknown>;
        return parseLiveExtraction(json);
      } catch (e) {
        if ((e as { code?: string }).code === 'EXTRACTION_FAILED') throw e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/abort/i.test(msg)) throw providerError('OCR provider timed out.', 'EXTRACTION_FAILED');
        throw providerError(`OCR provider failed: ${msg}`, 'EXTRACTION_FAILED');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function parseLiveExtraction(json: Record<string, unknown>): ExtractionResult {
  const facts = (json.facts && typeof json.facts === 'object' ? json.facts : json) as ExtractedFacts;
  return {
    extractorId: LIVE_EXTRACTOR_ID,
    model: String(json.model ?? 'configurable-ocr'),
    promptVersion: String(json.promptVersion ?? json.prompt_version ?? 'ab-02.ocr.v1'),
    facts,
    live: true,
  };
}

export function extractorFor(env: NodeJS.ProcessEnv = process.env): ExtractionProvider {
  if (env.AGENT_BRIDGE_EXTRACTOR === 'fixture' || env.NODE_ENV === 'test') return fixtureExtractor;
  if (env.AGENT_BRIDGE_OCR_LIVE === '1' || env.AGENT_BRIDGE_EXTRACTOR === 'live') {
    return liveExtractorFromEnv(env);
  }
  return {
    id: LIVE_EXTRACTOR_ID,
    async extract() {
      throw providerError('Live OCR is not opted in. Set AGENT_BRIDGE_OCR_LIVE=1 after configuring the provider.', 'PROVIDER_UNCONFIGURED');
    },
  };
}

export function isFixtureExtractor(id: string): boolean {
  return id === FIXTURE_EXTRACTOR_ID;
}

export function goldenIdFromHash(hash: string): GoldenCaseId | null {
  return caseIdFromHash(hash);
}

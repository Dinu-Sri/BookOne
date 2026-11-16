import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { liveExtractorFromEnv } from '../src/extraction';

describe('configurable OCR HTTP adapter', () => {
  it('forwards attachment bytes and MIME and does not fabricate facts', async () => {
    const seen: { contentType?: string; hash?: string; body: Buffer } = { body: Buffer.alloc(0) };
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      seen.contentType = String(req.headers['content-type'] ?? '');
      seen.hash = String(req.headers['x-content-hash'] ?? '');
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        seen.body = Buffer.concat(chunks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            model: 'contract-ocr',
            facts: {
              supplierName: { value: 'HTTP Vendor', origin: 'observed', page: 1, confidence: 0.9 },
            },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const bytes = new TextEncoder().encode('%PDF-synthetic');
    const extractor = liveExtractorFromEnv({
      AGENT_BRIDGE_OCR_ENDPOINT: `http://127.0.0.1:${port}/ocr`,
      AGENT_BRIDGE_OCR_KEY: 'contract-key',
    });
    const result = await extractor.extract({
      contentHash: 'abc123',
      bytes,
      mime: 'application/pdf',
    });
    server.close();
    expect(seen.contentType).toBe('application/pdf');
    expect(seen.hash).toBe('abc123');
    expect(Buffer.compare(seen.body, Buffer.from(bytes))).toBe(0);
    expect(result.live).toBe(true);
    expect(result.facts.supplierName?.value).toBe('HTTP Vendor');
    expect(result.facts.supplierName?.page).toBe(1);
    expect(result.facts.net).toBeUndefined();
  });

  it('fails closed on provider timeout without invented amounts', async () => {
    const extractor = liveExtractorFromEnv({
      AGENT_BRIDGE_OCR_ENDPOINT: 'http://127.0.0.1:1/ocr',
      AGENT_BRIDGE_OCR_KEY: 'x',
      AGENT_BRIDGE_OCR_TIMEOUT_MS: '50',
    });
    await expect(extractor.extract({ contentHash: 'x', bytes: new Uint8Array([1]), mime: 'application/pdf' })).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });
});

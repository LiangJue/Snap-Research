import { describe, expect, it, vi } from 'vitest';

import { extractCandidateClaims } from '@services/research/background/research-api-client';

describe('Candidate Claim extraction API seam', () => {
  it('can extract claims from selected text without sending image data', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body || '{}'));
      expect(body.selectedText).toBe('纯文字观点一。纯文字观点二。');
      expect(body.researchContext).toBe('优先保留需要查找真实案例的论点。');
      expect(body).not.toHaveProperty('imageDataUrl');
      return new Response(JSON.stringify({ claims: ['纯文字观点一。', '纯文字观点二。'], model: 'test-model' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await extractCandidateClaims(
      {
        pageTitle: '文字来源',
        pageUrl: 'https://example.com/text',
        selectedText: '纯文字观点一。纯文字观点二。',
        extractedText: '纯文字观点一。纯文字观点二。',
        researchContext: '优先保留需要查找真实案例的论点。',
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.claims.map((claim) => claim.text)).toEqual(['纯文字观点一。', '纯文字观点二。']);
  });

  it('requests claim extraction without starting a formal research task', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:8787/v1/research/claims');
      expect(init.method).toBe('POST');
      return new Response(
        JSON.stringify({
          claims: ['公司收入同比增长 20%。', '新产品将在 2027 年量产。'],
          model: 'test-model',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await extractCandidateClaims(
      {
        pageTitle: '行业截图',
        pageUrl: 'https://example.com/report',
        selectedText: '',
        extractedText: '截图正文',
        imageDataUrl: 'data:image/png;base64,AAAA',
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result.claims.map((claim) => claim.text)).toEqual(['公司收入同比增长 20%。', '新产品将在 2027 年量产。']);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

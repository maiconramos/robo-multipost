import { describe, expect, it, vi } from 'vitest';
import { consumeGeneratorStream } from './generator.stream';

const readerFor = (chunks: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }).getReader();
};

describe('consumeGeneratorStream', () => {
  it('recompoe um evento de sucesso dividido entre chunks', async () => {
    const output = { hook: 'Gancho', content: [{ content: 'Post' }] };
    const line = JSON.stringify({ name: 'done', data: { output } }) + '\n';
    const onEvent = vi.fn();

    const result = await consumeGeneratorStream(
      readerFor([line.slice(0, 17), line.slice(17)]),
      onEvent,
      'Falha ao gerar'
    );

    expect(result).toEqual(output);
    expect(onEvent).toHaveBeenCalledWith({ name: 'done', data: { output } });
  });

  it('propaga a mensagem do evento de erro mesmo quando ele chega fragmentado', async () => {
    const line =
      JSON.stringify({
        name: 'error',
        error: true,
        message: 'Conteudo recusado pelo provedor.',
      }) + '\n';

    await expect(
      consumeGeneratorStream(
        readerFor([line.slice(0, 11), line.slice(11, 29), line.slice(29)]),
        vi.fn(),
        'Falha ao gerar'
      )
    ).rejects.toThrow('Conteudo recusado pelo provedor.');
  });

  it('usa mensagem segura quando o servidor encerra com NDJSON invalido', async () => {
    await expect(
      consumeGeneratorStream(
        readerFor(['{"name":"done" sem-json}\n']),
        vi.fn(),
        'Falha ao gerar'
      )
    ).rejects.toThrow('Falha ao gerar');
  });
});

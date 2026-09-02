import {
  ResponseBodyTooLargeError,
  readResponseBodyWithLimit,
} from './bounded.response.reader';

describe('readResponseBodyWithLimit', () => {
  it('rejeita pelo Content-Length antes de ler o corpo', async () => {
    let pulled = false;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          pulled = true;
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      }),
      { headers: { 'content-length': '6' } }
    );

    await expect(readResponseBodyWithLimit(response, 5)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError
    );
    expect(pulled).toBe(false);
  });

  it('cancela transferencia chunked assim que o limite real e ultrapassado', async () => {
    let cancelled = false;
    const chunks = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7]),
    ];
    const response = new Response(
      new ReadableStream(
        {
          pull(controller) {
            const chunk = chunks.shift();
            if (!chunk) {
              controller.close();
              return;
            }
            controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 }
      )
    );

    await expect(readResponseBodyWithLimit(response, 5)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError
    );
    expect(cancelled).toBe(true);
    expect(chunks).toHaveLength(1);
  });

  it('aceita corpo exatamente no limite e preserva os bytes', async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4, 5]));

    await expect(readResponseBodyWithLimit(response, 5)).resolves.toEqual(
      Buffer.from([1, 2, 3, 4, 5])
    );
  });

  it('aceita resposta sem corpo como buffer vazio', async () => {
    const response = new Response(null);

    await expect(readResponseBodyWithLimit(response, 5)).resolves.toEqual(
      Buffer.alloc(0)
    );
  });
});

export type GeneratorStreamEvent = {
  name?: string;
  error?: boolean;
  message?: string;
  data?: { output?: unknown };
};

export const consumeGeneratorStream = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: GeneratorStreamEvent) => void,
  fallbackErrorMessage: string
) => {
  const decoder = new TextDecoder('utf-8');
  let lastResponse = {} as GeneratorStreamEvent;
  let buffered = '';

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    let event: GeneratorStreamEvent;
    try {
      event = JSON.parse(line) as GeneratorStreamEvent;
    } catch {
      throw new Error(fallbackErrorMessage);
    }

    if (event.error) {
      throw new Error(
        typeof event.message === 'string' && event.message.trim()
          ? event.message
          : fallbackErrorMessage
      );
    }

    onEvent(event);
    lastResponse = event;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffered += decoder.decode();
      consumeLine(buffered);
      return lastResponse.data?.output;
    }

    buffered += decoder.decode(value, { stream: true });
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      consumeLine(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
    }
  }
};

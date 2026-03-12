import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
// @ts-ignore
import mime from 'mime';
async function* nodeStreamToIterator(stream: any) {
  for await (const chunk of stream) {
    yield chunk;
  }
}
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(new Uint8Array(value));
      }
    },
  });
}
export const GET = (
  request: NextRequest,
  context: {
    params: {
      path: string[];
    };
  }
) => {
  if (!process.env.UPLOAD_DIRECTORY) {
    return new NextResponse('Upload directory not configured', { status: 500 });
  }
  const filePath =
    process.env.UPLOAD_DIRECTORY + '/' + context.params.path.join('/');
  if (!existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }
  const fileStats = statSync(filePath);
  const contentType = mime.getType(filePath) || 'application/octet-stream';
  const response = createReadStream(filePath);
  const iterator = nodeStreamToIterator(response);
  const webStream = iteratorToStream(iterator);
  return new Response(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileStats.size.toString(),
      'Last-Modified': fileStats.mtime.toUTCString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

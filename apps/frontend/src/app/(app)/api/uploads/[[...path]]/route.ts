import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { resolveSafeUploadFile } from '@gitroom/nestjs-libraries/upload/safe.upload.path';
import { parseHttpByteRange } from '@gitroom/nestjs-libraries/upload/http.byte.range';
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
export const GET = async (
  request: NextRequest,
  context: {
    params: Promise<{
      path?: string[];
    }>;
  }
) => {
  if (!process.env.UPLOAD_DIRECTORY) {
    return new NextResponse('Upload directory not configured', { status: 500 });
  }
  const { path } = await context.params;
  const filePath = resolveSafeUploadFile(
    process.env.UPLOAD_DIRECTORY,
    path ?? []
  );
  if (!filePath) {
    return new NextResponse('File not found', { status: 404 });
  }
  const fileStats = statSync(filePath);
  const byteRange = parseHttpByteRange(
    request.headers.get('range'),
    fileStats.size
  );
  if ('unsatisfiable' in byteRange) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${fileStats.size}`,
      },
    });
  }
  const contentType = mime.getType(filePath) || 'application/octet-stream';
  const response = byteRange.partial
    ? createReadStream(filePath, {
        start: byteRange.start,
        end: byteRange.end,
      })
    : createReadStream(filePath);
  const iterator = nodeStreamToIterator(response);
  const webStream = iteratorToStream(iterator);
  return new Response(webStream, {
    status: byteRange.partial ? 206 : 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': byteRange.length.toString(),
      'Accept-Ranges': 'bytes',
      ...(byteRange.partial
        ? {
            'Content-Range': `bytes ${byteRange.start}-${byteRange.end}/${fileStats.size}`,
          }
        : {}),
      'Last-Modified': fileStats.mtime.toUTCString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

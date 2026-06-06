import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { detectAllowedUploadMime } from '@gitroom/nestjs-libraries/upload/allowed.upload.mime';

@Injectable()
export class CustomFileValidationPipe implements PipeTransform {
  async transform(value: any) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    // Skip non-file parameters (org, body, query, etc.)
    if (
      !('buffer' in value) &&
      !('mimetype' in value) &&
      !('fieldname' in value)
    ) {
      return value;
    }

    if (!value.buffer || !Buffer.isBuffer(value.buffer)) {
      throw new BadRequestException('Invalid file upload.');
    }

    // Valida pelo conteudo real (magic bytes), nunca pelo mimetype declarado.
    const detected = await detectAllowedUploadMime(value.buffer);
    if (!detected) {
      throw new BadRequestException('Unsupported file type.');
    }

    const maxSize = this.getMaxSize(detected.mime);
    if (value.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds the maximum allowed size of ${maxSize} bytes.`
      );
    }

    value.mimetype = detected.mime;
    const safeBase =
      (value.originalname || 'upload')
        .replace(/\.[^./\\]*$/, '')
        .replace(/[\\/]/g, '_')
        .slice(0, 100) || 'upload';
    value.originalname = `${safeBase}.${detected.ext}`;

    return value;
  }

  private getMaxSize(mimeType: string): number {
    if (mimeType.startsWith('image/')) {
      return 10 * 1024 * 1024; // 10 MB
    } else if (mimeType.startsWith('video/')) {
      return 1024 * 1024 * 1024; // 1 GB
    } else {
      throw new BadRequestException('Unsupported file type.');
    }
  }
}

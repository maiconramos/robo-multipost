import { Global, Module } from '@nestjs/common';
import { UploadFactory } from './upload.factory';
import { MediaTransferService } from './media-transfer.service';
import { MediaChunkUploadService } from './media-chunk-upload.service';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';

@Global()
@Module({
  providers: [
    UploadFactory,
    CustomFileValidationPipe,
    MediaTransferService,
    MediaChunkUploadService,
  ],
  exports: [
    UploadFactory,
    CustomFileValidationPipe,
    MediaTransferService,
    MediaChunkUploadService,
  ],
})
export class UploadModule {}

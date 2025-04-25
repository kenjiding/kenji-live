import { Module } from '@nestjs/common';
import { StreamingService } from './services/streaming.service';
import { RoomService } from './services/room.service';
import { MediaService } from './services/media.service';
import { FFmpegService } from './services/ffmpeg.service';
import { StreamingGateway } from './gateways/streaming.gateway';
import { InteractiveGateway } from './gateways/interactive.gateway';

@Module({
  providers: [
    RoomService,
    MediaService,
    StreamingService,
    StreamingGateway,
    InteractiveGateway,
    FFmpegService
  ],
  exports: [StreamingService, RoomService],
})
export class LiveStreamingModule {}
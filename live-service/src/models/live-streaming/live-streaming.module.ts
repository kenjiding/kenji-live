import { Module } from '@nestjs/common';
import { StreamingService } from './services/streaming.service';
import { RoomService } from './services/room.service';
import { StreamingGateway } from './gateways/streaming.gateway';

@Module({
  providers: [
    RoomService,
    StreamingService,
    StreamingGateway,
  ],
  exports: [StreamingService, RoomService],
})
export class LiveStreamingModule {}
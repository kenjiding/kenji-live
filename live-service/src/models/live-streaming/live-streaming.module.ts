import { Module } from '@nestjs/common';
import { StreamingService } from './services/streaming.service';
import { RoomService } from './services/room.service';
import { StreamingGateway } from './gateways/streaming.gateway';
import { InteractiveGateway } from './gateways/interactive.gateway';

@Module({
  providers: [
    RoomService,
    StreamingService,
    StreamingGateway,
    InteractiveGateway,
  ],
  exports: [StreamingService, RoomService],
})
export class LiveStreamingModule {}
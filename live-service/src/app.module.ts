import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MediasoupService } from './models/mediasoup/mediasoup.service';
import { RoomService } from './models/room/room.service';
import { WebsocketGateway } from './models/websocket/websocket.gateway';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, MediasoupService, RoomService, WebsocketGateway],
})
export class AppModule {}

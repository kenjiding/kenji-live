import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import BaseStreamingGateway from './base.gateway';
import { MediaService } from '../services/media.service';
import { StreamingService } from '../services/streaming.service';
import { RoomService } from '../services/room.service';

@WebSocketGateway({
  namespace: '/live/interactive',
})
export class InteractiveGateway extends BaseStreamingGateway {

  @WebSocketServer()
  webSocketServer: Server;

  protected readonly loggerName = 'InteractiveStreamingGateway';
  
  constructor(
    streamingService: StreamingService,
    roomService: RoomService,
    mediaService: MediaService
  ) {
    super(streamingService, roomService, mediaService);
  }

  async handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`连麦客户端连接成功: ${client.id}`);
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`连麦客户端断开连接: ${client.id}`);
  }

  @SubscribeMessage('requestInteractive')
  async handleRequestInteractive(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      userId: string;
    },
  ) {
    // 首先通知创建者房间创建成功
    console.log('观众请求连麦');
    this.webSocketServer.to(data.roomId).emit('clientRequestInteractive', data);
  }

  @SubscribeMessage('allowInteractive')
  async handleIAllowInteractive(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      userId: string;
    },
  ) {
    const router = await this.mediaService.getOrCreateRouter(data.roomId);
    client.broadcast.to(data.roomId).emit('interactiveAccepted', {
      routerRtpCapabilities: router.rtpCapabilities
    });
  }
}

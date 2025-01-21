import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import BaseStreamingGateway from './base.gateway';
@WebSocketGateway({
  namespace: '/live/interactive',
})
export class InteractiveGateway extends BaseStreamingGateway {

  protected readonly loggerName = 'InteractiveStreamingGateway';

  @WebSocketServer()
  webSocketServer: Server;

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
    const router = await this.streamingService.getOrCreateRouter(data.roomId);
    client.broadcast.to(data.roomId).emit('interactiveAccepted', {
      routerRtpCapabilities: router.rtpCapabilities
    });
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import BaseStreamingGateway from './base.gateway';

@WebSocketGateway({
  namespace: '/live/streaming',
})
export class StreamingGateway extends BaseStreamingGateway {
  
  protected readonly loggerName = 'StreamingGateway';

  @WebSocketServer()
  webSocketServer: Server;

  async handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`直播客户端连接成功: ${client.id}`);
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`直播客户端断开连接: ${client.id}`);
  }
}

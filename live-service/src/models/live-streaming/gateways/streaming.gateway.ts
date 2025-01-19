import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup/node/lib/types';
import { StreamingService } from '../services/streaming.service';
import { RoomService } from '../services/room.service';

const MAX_ROOM_CAPACITY = 100;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
  namespace: '/live',
})
export class StreamingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  webSocketServer: Server;

  private readonly logger = new Logger('StreamingGateway');

  constructor(
    private readonly streamingService: StreamingService,
    private readonly roomService: RoomService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`1,客户端连接成功: ${client.id}`);
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`客户端断开连接: ${client.id}`);
  }

  async joinRoom(roomId, client) {
    const clients = await this.webSocketServer.in(roomId).fetchSockets();
    if (clients.length >= MAX_ROOM_CAPACITY) {
      this.logger.error(roomId + `已超过${MAX_ROOM_CAPACITY}人, 房间已满`);
      this.webSocketServer.to(roomId).emit('roomJoinError', { 
        message: '房间已满' 
      });
      return;
    }

    client.join(roomId);
  }

  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
    },
  ) {
    const router = await this.streamingService.getOrCreateRouter(data.roomId);
    await this.joinRoom(data.roomId, client);
    // 首先通知创建者房间创建成功
    client.emit('roomCreated', {
      roomId: data.roomId,
      routerRtpCapabilities: router.rtpCapabilities,
    });
    
    // 然后广播给房间内的其他成员（如果有的话）
    client.broadcast.to(data.roomId).emit('newRoomAvailable', {
      roomId: data.roomId,
      routerRtpCapabilities: router.rtpCapabilities,
    });
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
    this.webSocketServer.to(data.roomId).emit('clientRequestInteractive', data);
    console.log('clientRequestInteractive: ', 9090900);
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
    this.webSocketServer.to(data.roomId).emit('interactiveAccepted');
  }
  
  @SubscribeMessage('createTransport')
  async handleCreateTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      clientId: string;
    },
  ) {
    const router = await this.streamingService.getOrCreateRouter(data.roomId);
    this.roomService.createPeer(data.clientId, data.roomId);

    // 创建webRTC传输通道
    const transport = await this.streamingService.createWebRtcTransport(router, data.clientId);
    console.log('Transport created for client:', data.clientId);

    client.emit('transportIsCreated',
      {
        transportOptions: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      },
    );
  }

  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      transportId;
      roomId;
      dtlsParameters;
      from;
    },
  ) {
    try {
      await this.streamingService.connectTransport(data);
      const producerList = this.roomService.getProducerList(data.roomId);
      client.emit('transportConnected',{viewers: 0});
      client.broadcast.to(data.roomId).emit('producers', { producers: producerList });
    } catch (error) {
      console.error('连接传输失败:', error);
      client.emit('error',
        {
          type: 'error',
          message: error.message,
        },
      );
    }
  }

  @SubscribeMessage('viewerJionRoom')
  async handleGetRouterRtpCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
    },
  ) {
    await this.joinRoom(data.roomId, client);
    const { rtpCapabilities } = await this.streamingService.getOrCreateRouter(data.roomId);
    client.emit('getRouterRtpCapabilities',
      {
        rtpCapabilities
      },
    );
  }

  @SubscribeMessage('consume')
  async handleCreateConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId;
      producerId;
      transportId;
      rtpCapabilities: RtpCapabilities;
      clientId;
    },
  ) {
    try {
      const {
        consumer,
        producer,
      } = await this.streamingService.createConsume(data);
      client.emit('consumerCreated',
        {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          consumerType: consumer.type,
          producerPaused: consumer.producerPaused,
        },
      );
    } catch (error) {
      console.log('consume error: ', error);
    }
  }

  @SubscribeMessage('getProducers')
  async handlGegetProducers(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
    },
  ) {
    const producerList = this.roomService.getProducerList(data.roomId);
    client.emit('producers',
      {
        producers: producerList,
      },
    );
  }

  @SubscribeMessage('produce')
  async handleCreateProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      transportId: string;
      kind: MediaKind;
      roomId: string;
      clientId: string;
      rtpParameters: RtpParameters;
    },
  ) {
    const producer = await this.streamingService.createProduce(data);
    // 向创建 producer 的客户端发送确认
    client.emit('producerCreated', {
      producerId: producer.id,
    });
    
    // 通知房间内其他人有新的 producer（使用 broadcast）
    client.broadcast.to(data.roomId).emit('newProducer', {
      producerId: producer.id,
      clientId: data.clientId
    });
  }

  @SubscribeMessage('stopStreaming')
  async handleStopStreaming(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      clientId: string;
    },
  ) {
    const producerIds = this.streamingService.getProducerIds(data);
    // 广播给房间内其他成员
    client.broadcast.to(data.roomId).emit('livestreamStopped', {producerIds});
  }
}

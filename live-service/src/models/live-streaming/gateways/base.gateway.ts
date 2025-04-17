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
import { MediaService } from '../services/media.service';

const MAX_ROOM_CAPACITY = 100;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
})
export default abstract class BaseStreamingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{

  // 定义抽象方法，子类必须实现
  abstract handleConnection(client: Socket): Promise<void>;
  abstract handleDisconnect(client: Socket): Promise<void>;

  protected readonly loggerName: string;
  protected readonly logger: Logger;

  @WebSocketServer()
  webSocketServer: Server;

  constructor(
    private readonly streamingService: StreamingService,
    private readonly roomService: RoomService,
    public readonly mediaService: MediaService,
  ) {
    this.logger = new Logger(this.loggerName);
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
    const router = await this.mediaService.getOrCreateRouter(data.roomId);
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

  @SubscribeMessage('createTransport')
  async handleCreateTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      clientId: string;
    },
  ) {
    // 创建webRTC传输通道
    const transport = await this.streamingService.createWebRTCRouter(data);
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
      if(!consumer || !producer) throw new Error('Failed to create consumer');
      await this.mediaService.handleConsumerCreation(consumer);

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
        from: 'getProducers'
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
    const producer = await this.roomService.createProduce(data);
    await this.mediaService.handleProducerCreation(producer);

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
    const producerIds = this.roomService.getProducerIds(data);
    // 广播给房间内其他成员
    client.broadcast.to(data.roomId).emit('livestreamStopped', {producerIds});
  }
}

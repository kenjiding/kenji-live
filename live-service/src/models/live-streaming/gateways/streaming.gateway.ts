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

interface Peer {
  roomId;
  socket: Socket;
  transports: Set<string>;
  producers: Set<string>;
  consumers: Set<string>;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'],
  namespace: '/',
})
export class StreamingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

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
    this.handlePeerDisconnect(client);
  }

  handlePeerDisconnect(client: Socket) {
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
    client.emit('roomCreated',
      {
        roomId: data.roomId,
        routerRtpCapabilities: router.rtpCapabilities,
      },
    );
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
    this.roomService.createPeer(data.clientId, data.roomId, client);

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
    },
  ) {
    try {
      await this.streamingService.connectTransport(data);
      const producerList = this.roomService.getProducerList(data.roomId);
      
      // await addViewer(data.roomId, data.clientId);
      // const viewers = await getViewerCount(data.roomId);
      client.emit('transportConnected',
        {
          viewers: 0,
        },
      );

      client.emit('producers',
        {
          producers: producerList,
        },
      );
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

  @SubscribeMessage('getRouterRtpCapabilities')
  async handleGetRouterRtpCapabilities(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
    },
  ) {
    const {
      rtpCapabilities
    } = await this.streamingService.getOrCreateRouter(data.roomId);
    client.emit('routerRtpCapabilities',
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
          type: 'consumerCreated',
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
        type: 'producers',
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
    client.emit('producerCreated',
      {
        producerId: producer.id,
      },
    );
    
    // 通知房间内其他人
    this.broadcastNewProducer(data.roomId, producer.id, data.clientId);
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
    this.roomService.peers.forEach((peer, peerId) => {
      if (peer.roomId === data.roomId && peerId !== data.clientId) {
        peer.socket.emit('livestreamStopped',
          {
            type: 'livestreamStopped',
            producerIds,
          },
        );
      }
    });
  }

  broadcastNewProducer(roomId, producerId, excludeClientId) {
    this.roomService.peers.forEach((peer, clientId) => {
      if (peer.roomId === roomId && clientId !== excludeClientId) {
        peer.socket.emit('newProducer',
          {
            type: 'newProducer',
            producerId: producerId,
          },
        );
      }
    });
  }
}

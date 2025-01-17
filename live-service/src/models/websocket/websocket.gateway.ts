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
  WebRtcTransport,
  Producer,
  Consumer,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup/node/lib/types';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { webRtcTransportOptions } from '../mediasoup/configs';
import { Router } from 'mediasoup/node/lib/types';

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
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('WebsocketGateway');
  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();
  private transports: Map<string, WebRtcTransport> = new Map();
  private peers: Map<string, Peer> = new Map();
  private rooms: Map<string, Router> = new Map();

  constructor(private readonly mediasoupService: MediasoupService) {}

  async getOrCreateRouter(roomId) {
    let router = this.rooms.get(roomId);
    if (!router) {
      router = await this.mediasoupService.getMediaCodecsRouters();
      this.rooms.set(roomId, router);
      console.log('Created new router for room:', roomId);
      return router;
    }
    return router;
  }

  async handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`客户端连接成功: ${client.id}`);
  }

  createPeer(clientId, roomId, socket) {
    const peer: Peer = {
      roomId,
      socket,
      transports: new Set(),
      producers: new Set(),
      consumers: new Set(),
    };
    this.peers.set(clientId, peer);
    return peer;
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`客户端断开连接: ${client.id}`);
    this.handlePeerDisconnect(client);
  }

  handlePeerDisconnect(client: Socket) {
    console.log('client: ', 1212, client.id);
  }

  async createWebRtcTransport(router: Router, clientId: string) {
    const transport = await router.createWebRtcTransport(
      webRtcTransportOptions,
    );

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed' || dtlsState === 'failed') {
        transport.close();
      }
    });

    transport.observer.on('close', () => {
      console.log('Transport closed');
      this.transports.delete(transport.id);
      const peer = this.peers.get(clientId);
      if (peer) {
        peer.transports.delete(transport.id);
      }
    });
    this.transports.set(transport.id, transport);

    const peer = this.peers.get(clientId);
    if (peer) {
      peer.transports.add(transport.id);
    }

    return transport;
  }

  @SubscribeMessage('message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: string,
  ): string {
    console.log('收到消息:', data);
    return data; // 简单的消息回显
  }

  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
    },
  ) {
    const router = await this.getOrCreateRouter(data.roomId);
    client.send(
      JSON.stringify({
        type: 'roomCreated',
        roomId: data.roomId,
        routerRtpCapabilities: router.rtpCapabilities,
      }),
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
    const router = await this.getOrCreateRouter(data.roomId);
    this.createPeer(data.clientId, data.roomId, client);

    // 创建webRTC传输通道
    const transport = await this.createWebRtcTransport(router, data.clientId);
    console.log('Transport created for client:', data.clientId);

    client.send(
      JSON.stringify({
        type: 'transportIsCreated',
        transportOptions: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      }),
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
      const transport = this.transports.get(data.transportId);
      if (!transport) {
        console.log('现有传输列表:', Array.from(this.transports.keys()));
        throw new Error(`找不到传输: ${data.transportId}`);
      }

      // 验证 DTLS 参数
      if (
        !data.dtlsParameters ||
        !Array.isArray(data.dtlsParameters.fingerprints)
      ) {
        console.error('无效的 DTLS 参数:', data.dtlsParameters);
        throw new Error('无效的 DTLS 参数');
      }

      // 连接传输
      await transport.connect({
        dtlsParameters: {
          fingerprints: data.dtlsParameters.fingerprints,
          role: data.dtlsParameters.role || 'auto',
        },
      });

    this.logger.log(`transport连接成功`);

      // await addViewer(data.roomId, data.clientId);
      // const viewers = await getViewerCount(data.roomId);
      client.send(
        JSON.stringify({
          type: 'transportConnected',
          viewers: 0,
        }),
      );

      // 获取并发送生产者列表
      const producerList = Array.from(this.producers.values())
        .filter((producer) => producer.appData.roomId === data.roomId)
        .map((producer) => ({
          id: producer.id,
          kind: producer.kind,
        }));

      client.send(
        JSON.stringify({
          type: 'producers',
          producers: producerList,
        }),
      );
    } catch (error) {
      console.error('连接传输失败:', error);
      client.send(
        JSON.stringify({
          type: 'error',
          message: error.message,
        }),
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
    const router = await this.getOrCreateRouter(data.roomId);
    client.send(
      JSON.stringify({
        type: 'routerRtpCapabilities',
        rtpCapabilities: router.rtpCapabilities,
      }),
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
      const router = this.rooms.get(data.roomId);
      const producer = this.producers.get(data.producerId);

      if (!router || !producer) {
        throw new Error('Router or producer not found');
      }

      if (
        !router.canConsume({
          producerId: producer.id,
          rtpCapabilities: data.rtpCapabilities,
        })
      ) {
        throw new Error('Cannot consume this producer');
      }

      const transport = this.transports.get(data.transportId);
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: data.rtpCapabilities,
        paused: false,
      });

      const peer = this.peers.get(data.clientId);
      peer.consumers.add(consumer.id);
      this.consumers.set(consumer.id, consumer);
      client.send(
        JSON.stringify({
          type: 'consumerCreated',
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          consumerType: consumer.type,
          producerPaused: consumer.producerPaused,
        }),
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
    const producerList = Array.from(this.producers.values())
      .filter((producer) => producer.appData.roomId === data.roomId)
      .map((producer) => ({
        id: producer.id,
        kind: producer.kind,
      }));

    client.send(
      JSON.stringify({
        type: 'producers',
        producers: producerList,
      }),
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
    const transport = this.transports.get(data.transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${data.transportId}`);
    }

    const producer = await transport.produce({
      kind: data.kind,
      rtpParameters: data.rtpParameters,
      appData: { peerId: data.clientId, roomId: data.roomId },
    });

    const peer = this.peers.get(data.clientId);
    peer.producers.add(producer.id);
    this.producers.set(producer.id, producer);
    client.send(
      JSON.stringify({
        type: 'producerCreated',
        producerId: producer.id,
      }),
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
    const producersToRemove = Array.from(this.producers.values()).filter(
      (producer) =>
        producer.appData.clientId === data.clientId &&
        producer.appData.roomId === data.roomId,
    );

    producersToRemove.forEach((producer) => {
      producer.close();
      this.producers.delete(producer.id);
    });

    // 广播给房间内其他成员
    this.peers.forEach((peer, peerId) => {
      if (peer.roomId === data.roomId && peerId !== data.clientId) {
        peer.socket.send(
          JSON.stringify({
            type: 'livestreamStopped',
            producerIds: producersToRemove.map((p) => p.id),
          }),
        );
      }
    });
  }

  broadcastNewProducer(roomId, producerId, excludeClientId) {
    this.peers.forEach((peer, clientId) => {
      if (peer.roomId === roomId && clientId !== excludeClientId) {
        peer.socket.send(
          JSON.stringify({
            type: 'newProducer',
            producerId: producerId,
          }),
        );
      }
    });
  }
}

// @SubscribeMessage('createRoom')
// async handleCreateRoom(
//   @ConnectedSocket() client: Socket,
//   @MessageBody()
//   data: {
//     roomId: string;
//   },
// ) {
//   const router = await this.getOrCreateRouter(data.roomId);
//   client.send(
//     JSON.stringify({
//       type: 'roomCreated',
//       roomId: data.roomId,
//       routerRtpCapabilities: router.rtpCapabilities,
//     }),
//   );
// }

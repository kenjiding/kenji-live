import { Logger } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
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
import { FFmpegService } from '../services/ffmpeg.service';

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
    private readonly ffmpegService: FFmpegService,
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
    client.emit('roomCreated', {
      roomId: data.roomId,
      routerRtpCapabilities: router.rtpCapabilities,
    });
    
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
    const transport = await this.streamingService.createWebRTCRouter(data);
    console.log('transportIsCreated执行次数: ', 99);
    client.emit('transportIsCreated', {
      transportOptions: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });
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
      client.emit('transportConnected', { viewers: 0 });
      client.broadcast.to(data.roomId).emit('producers', { producers: producerList });
    } catch (error) {
      console.error('连接传输失败:', error);
      client.emit('error', {
        type: 'error',
        message: error.message,
      });
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
      const { consumer, producer } = await this.streamingService.createConsume(data);
      if (!consumer || !producer) throw new Error('Failed to create consumer');
      await this.mediaService.handleConsumerCreation(consumer);

      client.emit('consumerCreated', {
        id: consumer.id,
        producerId: producer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        consumerType: consumer.type,
        producerPaused: consumer.producerPaused,
      });
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
    client.emit('producers', {
      producers: producerList,
      from: 'getProducers'
    });
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
    try {
      // 检查是否已存在 Producer
      const existingProducer = Array.from(this.roomService.producers.values()).find(
        (p) => p.appData.clientId === data.clientId && p.appData.roomId === data.roomId && p.kind === data.kind,
      );
      if (existingProducer) {
        this.logger.log(`Producer already exists for client ${data.clientId}, kind ${data.kind}`);
        const hlsUrl = `http://127.0.0.1:8080/hls/${data.roomId}/stream.m3u8`;
        client.emit('producerCreated', {
          producerId: existingProducer.id,
          hlsUrl,
        });
        client.broadcast.to(data.roomId).emit('newProducer', {
          producerId: existingProducer.id,
          clientId: data.clientId,
          hlsUrl,
        });
        return;
      }

      // 创建 Producer
      const producer = await this.roomService.createProduce(data);
      await this.mediaService.handleProducerCreation(producer);
      this.logger.log(`Producer created: ${producer.id} for room ${data.roomId}`);

      // 检查是否已存在 PlainRtpTransport
      let plainTransport: mediasoup.types.PlainTransport | undefined;
      let consumer: mediasoup.types.Consumer | undefined;
      const existingTransport = Array.from(this.roomService.transports.values()).find(
        (t) => t.appData?.roomId === data.roomId,
      );
      if (existingTransport) {
        this.logger.log(`PlainRtpTransport already exists for room ${data.roomId}`);
        plainTransport = existingTransport as mediasoup.types.PlainTransport;
        // 检查是否已存在 Consumer
        consumer = Array.from(this.roomService.consumers.values()).find(
          (c) => c.producerId === producer.id && c.appData?.roomId === data.roomId,
        );
      }

      // 创建新的 PlainRtpTransport（如果不存在）
      if (!plainTransport) {
        const router = this.roomService.getRoom(data.roomId);
        plainTransport = await this.mediaService.createPlainRtpTransport(router, data.roomId);
        plainTransport.appData = { roomId: data.roomId };
        this.roomService.transports.set(plainTransport.id, plainTransport);
        this.logger.log(`Created PlainRtpTransport: ${plainTransport.id} for room ${data.roomId}`);
      }

      // 创建 Consumer（如果不存在）
      if (!consumer) {
        consumer = await this.mediaService.connectPlainRtpTransport(plainTransport, producer);
        this.roomService.consumers.set(consumer.id, consumer);
        this.logger.log(`Created Consumer: ${consumer.id} for Producer: ${producer.id}`);
      }

      // 启动 FFmpeg（仅在第一个 Producer 时启动）
      let hlsUrl = `http://127.0.0.1:8080/hls/${data.roomId}/stream.m3u8`;
      if (!this.ffmpegService.isTranscoding(data.roomId)) {
        const rtpPort = plainTransport.tuple.localPort;
        const rtcpPort = plainTransport.rtcpTuple?.localPort;
        this.logger.log(`Starting FFmpeg with RTP port: ${rtpPort}, RTCP port: ${rtcpPort}`);
        // hlsUrl = await this.ffmpegService.startHlsTranscoding(data.roomId, rtpPort, rtcpPort);
      }

      // 通知客户端
      client.emit('producerCreated', {
        producerId: producer.id,
        hlsUrl,
      });
      client.broadcast.to(data.roomId).emit('newProducer', {
        producerId: producer.id,
        clientId: data.clientId,
        hlsUrl,
      });
    } catch (error) {
      this.logger.error(`Failed to handle produce: ${error.message}`);
      client.emit('error', {
        type: 'produce_error',
        message: error.message,
      });
    }
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

    try {
      this.logger.log(`Stop streaming triggered for room ${data.roomId}, client ${data.clientId}`);
      const producerIds = await this.roomService.closeRoomResources(data);
      client.broadcast.to(data.roomId).emit('livestreamStopped', { producerIds });
      await this.ffmpegService.stopHlsTranscoding(data.roomId);
      this.logger.log(`Resources cleaned for room ${data.roomId}`);
      client.emit('streamingStopped', { success: true });
    } catch (error) {
      this.logger.error(`Failed to stop streaming for room ${data.roomId}: ${error.message}`);
      client.emit('error', {
        type: 'stop_streaming_error',
        message: error.message,
      });
    }
    const producerIds = this.roomService.getProducerIds(data);
    client.broadcast.to(data.roomId).emit('livestreamStopped', { producerIds });
    // 停止 FFmpeg 进程
    this.ffmpegService.stopHlsTranscoding(data.roomId);
  }
}
import { Injectable, OnModuleInit } from '@nestjs/common';
import { RoomService } from './room.service';
import { MediaService } from './media.service';

@Injectable()
export class StreamingService implements OnModuleInit {
  constructor(
    private readonly roomService: RoomService,
    private readonly mediaService: MediaService,
  ) {}
  
  async onModuleInit() {
    await this.mediaService.createWorkers();
  }

  public async createConsume({
    roomId,
    clientId,
    producerId,
    transportId,
    rtpCapabilities
  }) {
    try {
      const router = this.roomService.getRoom(roomId);
      const producer = this.roomService.producers.get(producerId);

      if (!router || !producer) {
        throw new Error('Router or producer not found');
      }

      if (
        !router.canConsume({
          producerId: producer.id,
          rtpCapabilities: rtpCapabilities,
        })
      ) {
        throw new Error('Cannot consume this producer');
      }

      const transport = this.roomService.transports.get(transportId);
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: rtpCapabilities,
        paused: false,
      });

      const peer = this.roomService.peers.get(clientId);
      peer.consumers.add(consumer.id);
      this.roomService.consumers.set(consumer.id, consumer);

      return {
        producer,
        consumer
      };
    } catch (error) {
      console.log('consume error: ', error);
    }
  }

  public async connectTransport({
    transportId,
    roomId,
    dtlsParameters,
  }) {
    const transport = this.roomService.transports.get(transportId);
    if (!transport) {
      console.log('现有传输列表:', Array.from(this.roomService.transports.keys()));
      throw new Error(`找不到传输: ${transportId}`);
    }

    // 验证 DTLS 参数
    if (
      !dtlsParameters ||
      !Array.isArray(dtlsParameters.fingerprints)
    ) {
      console.error('无效的 DTLS 参数:', dtlsParameters);
      throw new Error('无效的 DTLS 参数');
    }

    // 连接传输
    await transport.connect({
      dtlsParameters: {
        fingerprints: dtlsParameters.fingerprints,
        role: dtlsParameters.role || 'auto',
      },
    });
  }

  public async createWebRTCRouter(data) {
    const router = await this.mediaService.getOrCreateRouter(data.roomId);
    this.roomService.createPeer(data.clientId, data.roomId);
    console.log('已经设置了cientID ', data.clientId);

    // 创建webRTC传输通道
    return await this.mediaService.createWebRtcTransport(router, data.clientId);
  }

}

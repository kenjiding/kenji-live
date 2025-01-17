import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import {
  Worker,
  RtpCodecCapability,
} from 'mediasoup/node/lib/types';
import { mediaCodecs, webRtcTransportOptions } from '../configs';
import { Router } from 'mediasoup/node/lib/types';
import { RoomService } from './room.service';

@Injectable()
export class StreamingService implements OnModuleInit {
  private worker: Worker;
  private readonly mediaCodecs: RtpCodecCapability[] = mediaCodecs;

  constructor(
    private readonly roomService: RoomService,
  ) {}
  
  async onModuleInit() {
    await this.createMediasoupWorker();
  }

  async createMediasoupWorker() {
    try {
      if (!this.worker) {
        this.worker = await mediasoup.createWorker({
          logLevel: 'debug',
          rtcMinPort: 10000,
          rtcMaxPort: 10100,
        });

        // add worker event listeners
        this.worker.on('died', () => {
          console.error('mediasoup worker died');
          this.worker = null;
        });
      }
      console.log('Mediasoup worker created [pid:%d]', this.worker.pid);
    } catch (error) {
      console.error('Failed to create Mediasoup worker:', error);
      throw error;
    }
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
      this.roomService.transports.delete(transport.id);
      const peer = this.roomService.peers.get(clientId);
      if (peer) {
        peer.transports.delete(transport.id);
      }
    });
    this.roomService.transports.set(transport.id, transport);

    const peer = this.roomService.peers.get(clientId);
    if (peer) {
      peer.transports.add(transport.id);
    }

    return transport;
  }

  async getOrCreateRouter(roomId) {
    let router = this.roomService.getRoom(roomId);
    if (!router) {
      router = await this.getMediaCodecsRouters();
      this.roomService.setRoom(roomId, router);
      console.log('Created new router for room:', roomId);
      return router;
    }
    return router;
  }

  async createConsume({
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

  async createProduce({
    kind,
    roomId,
    transportId,
    clientId,
    rtpParameters,
  }) {
    const transport = this.roomService.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = await transport.produce({
      kind: kind,
      rtpParameters: rtpParameters,
      appData: { peerId: clientId, roomId: roomId },
    });

    const peer = this.roomService.peers.get(clientId);
    peer.producers.add(producer.id);
    this.roomService.producers.set(producer.id, producer);
    return producer;
  }

  async connectTransport({
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

  async getProducerIds({
    clientId,
    roomId
  }) {
    const producersToRemove = Array.from(this.roomService.producers.values()).filter(
      (producer) =>
        producer.appData.clientId === clientId &&
        producer.appData.roomId === roomId,
    );

    producersToRemove.forEach((producer) => {
      producer.close();
      this.roomService.producers.delete(producer.id);
    });

    return producersToRemove.map((p) => p.id);
  }

  async getMediaCodecsRouters() {
    try {
      await this.createMediasoupWorker();
      return await this.worker.createRouter({ mediaCodecs: this.mediaCodecs });
    } catch (error) {
      console.error('Failed to create router:', error);
      throw error;
    }
  }
}

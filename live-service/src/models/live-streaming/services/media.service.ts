import * as os from 'os';
import * as mediasoup from 'mediasoup';
import { Injectable } from '@nestjs/common';
import { Producer, Consumer, Transport, Router, Worker, PlainTransport } from "mediasoup/node/lib/types";
import { mediaCodecs, webRtcTransportOptions } from '../configs';
import { RoomService } from './room.service';

@Injectable()
export class MediaService {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;

  constructor(private readonly roomService: RoomService) {}

  public async createWorkers() {
    const numWorkers = os.cpus().length;
    
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 10000 + (i * 1000), // 扩展端口范围
        rtcMaxPort: 10999 + (i * 1000),
      });

      worker.on('died', () => {
        console.error(`Worker ${worker.pid} died`);
        this.replaceDeadWorker(i);
      });

      this.workers.push(worker);
      console.log(`Created worker ${i + 1}/${numWorkers}, ports ${10000 + i * 1000}-${10999 + i * 1000}`);
    }
  }

  private async replaceDeadWorker(index: number) {
    try {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 10000 + (index * 1000),
        rtcMaxPort: 10999 + (index * 1000),
      });

      worker.on('died', () => {
        console.error(`Worker ${worker.pid} died`);
        this.replaceDeadWorker(index);
      });

      this.workers[index] = worker;
      console.log(`Replaced worker ${index + 1}`);
    } catch (error) {
      console.error('Failed to replace dead worker:', error);
      setTimeout(() => this.replaceDeadWorker(index), 5000);
    }
  }

  public async getOrCreateRouter(roomId: string): Promise<Router> {
    let router = this.roomService.getRoom(roomId);
    if (!router) {
      const worker = this.getNextWorker();
      router = await worker.createRouter({ mediaCodecs });
      this.roomService.setRoom(roomId, router);
    }
    return router;
  }

  private getNextWorker(): Worker {
    console.log('this.nextWorkerIndex: ', this.nextWorkerIndex);
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  public async createWebRtcTransport(router: Router, clientId: string) {
    const transport = await router.createWebRtcTransport(
      webRtcTransportOptions,
    );

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'connected') {
        this.setupBitrateMonitoring(transport);
      }
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

  public async createPlainRtpTransport(router: Router, roomId: string): Promise<PlainTransport> {
    const plainTransport = await router.createPlainTransport({
      listenIp: { ip: '0.0.0.0', announcedIp: '127.0.0.1' }, // 本地调试
      rtcpMux: false,
      comedia: true, // FFmpeg 使用主动模式
    });

    plainTransport.on('tuple', (tuple) => {
      console.log(`PlainRtpTransport tuple assigned: ${JSON.stringify(tuple)}`);
    });

    plainTransport.on('@close', () => {
      console.log(`PlainRtpTransport closed for room ${roomId}`);
    });

    return plainTransport;
  }

  public async connectPlainRtpTransport(plainTransport: PlainTransport, producer: Producer) {
    try {
      const consumer = await plainTransport.consume({
        producerId: producer.id,
        rtpCapabilities: {
          codecs: mediaCodecs,
        },
        paused: false,
        appData: {
          roomId: producer.appData.roomId,
          transportId: plainTransport.id, // 存储 Transport ID
        },
      });
      console.log(`Consumer created for PlainRtpTransport: ${consumer.id}`);
      return consumer;
    } catch (error) {
      console.error('Failed to consume on PlainRtpTransport:', error);
      throw error;
    }
  }

  private setupBitrateMonitoring(transport: Transport) {
    let lastBitrate = 600000;
    
    const monitorInterval = setInterval(async () => {
      if (transport.closed) {
        clearInterval(monitorInterval);
        return;
      }

      try {
        const stats = await transport.getStats();
        const transportStats = stats.find((s: any) => s.type === 'transport');
        if (!transportStats) return;

        const newBitrate = await this.adjustBitrate(transport, transportStats, lastBitrate);
        lastBitrate = newBitrate;
      } catch (error) {
        console.error('Bitrate monitoring error:', error);
      }
    }, 2000);
  }

  private async adjustBitrate(
    transport: Transport, 
    stats: any, 
    lastBitrate: number
  ): Promise<number> {
    const roundTripTime = stats.roundTripTime;
    const availableBitrate = stats.availableOutgoingBitrate;

    let newBitrate = lastBitrate;

    if (roundTripTime > 100) {
      newBitrate = Math.max(lastBitrate * 0.8, 100000);
    } else if (roundTripTime < 50 && availableBitrate > lastBitrate) {
      newBitrate = Math.min(lastBitrate * 1.2, 1500000);
    }

    if (newBitrate !== lastBitrate) {
      await transport.setMaxOutgoingBitrate(newBitrate);
      console.log(`Adjusted bitrate to ${newBitrate} bps`);
    }

    return newBitrate;
  }

  public async handleProducerCreation(producer: Producer) {
    producer.observer.on('score', async (score) => {
      await this.handleProducerScore(producer, score);
    });
  }

  private async handleProducerScore(producer: Producer, score: any) {
    if (score.score < 5) {
      const appData = producer.appData as { qualityIndex?: number };
      appData.qualityIndex = ((appData.qualityIndex as number) || 2) - 1;
      if (appData.qualityIndex < 0) appData.qualityIndex = 0;
      console.log(`Producer ${producer.id} quality reduced to index ${appData.qualityIndex}`);
    }
  }

  public async handleConsumerCreation(consumer: Consumer) {
    await consumer.setPreferredLayers({ 
      spatialLayer: 2, 
      temporalLayer: 2 
    });

    consumer.observer.on('layerschange', async (layers) => {
      await this.handleConsumerLayers(consumer, layers);
    });
  }

  private async handleConsumerLayers(consumer: Consumer, layers: any) {
    if (!layers) return;

    if (layers.spatialLayer < 2 || layers.temporalLayer < 2) {
      await consumer.setPreferredLayers({
        spatialLayer: Math.max(0, layers.spatialLayer),
        temporalLayer: Math.max(0, layers.temporalLayer)
      });
    }
  }
}
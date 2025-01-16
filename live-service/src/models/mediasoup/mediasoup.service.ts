import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
// import { WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';
import {
  Worker,
  // WebRtcTransport,
  // Producer,
  // Consumer,
  RtpCodecCapability,
} from 'mediasoup/node/lib/types';
import { mediaCodecs } from './configs';

// interface Room {
//   id: string;
//   peers: Map<string, Peer>;
// }

@Injectable()
export class MediasoupService implements OnModuleInit {
  private worker: Worker;
  private readonly mediaCodecs: RtpCodecCapability[] = mediaCodecs;

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

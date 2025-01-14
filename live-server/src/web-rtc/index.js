import mediasoup from 'mediasoup';
import { mediaCodecs } from './configs.js';

let worker;

// create Mediasoup Worker
export const createWorker = async () => {
  try {
    if (!worker) {
      worker = await mediasoup.createWorker({
        logLevel: 'debug',
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
      });
      
      // add worker event listeners
      worker.on('died', () => {
        console.error('mediasoup worker died');
        worker = null;
      });
    }
    console.log('Mediasoup worker created [pid:%d]', worker.pid);
    return worker;
  } catch (error) {
    console.error('Failed to create Mediasoup worker:', error);
    throw error;
  }
};

export const getMediaCodecsRouters = async () => {
  try {
    const worker = await createWorker();
    return await worker.createRouter({ mediaCodecs });
  } catch (error) {
    console.error('Failed to create router:', error);
    throw error;
  }
};
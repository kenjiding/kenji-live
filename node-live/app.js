// server.js
const express = require('express');
const http = require('http');
const mediasoup = require('mediasoup');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// 全局变量
let worker;
const rooms = new Map(); // roomId => Router
const peers = new Map();  // peerId => { roomId, socket, transports[], producers[], consumers[] }
const transports = new Map(); // transportId => Transport
const producers = new Map();  // producerId => Producer
const consumers = new Map();  // consumerId => Consumer

// Mediasoup 配置
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    parameters: {
      maxPlaybackRate: 48000,
      stereo: 1,
      useinbandfec: 1
    }
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
];

// WebRTC 传输配置
const webRtcTransportOptions = {
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: '127.0.0.1' // 根据您的服务器IP修改
    }
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1000000
};

// 创建 Mediasoup Worker
const createWorker = async () => {
  worker = await mediasoup.createWorker({
    logLevel: 'debug',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  });
  console.log('Mediasoup worker created [pid:%d]', worker.pid);
  return worker;
};

// WebSocket 连接处理
wss.on('connection', async (socket) => {
  console.log('New WebSocket connection');

  socket.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);

      switch (data.type) {
        case 'getRouterRtpCapabilities':
          {
            const router = await getOrCreateRouter(data.roomId);
            socket.send(JSON.stringify({
              type: 'routerRtpCapabilities',
              rtpCapabilities: router.rtpCapabilities
            }));
          }
          break;

        case 'createRoom':
          {
            const router = await getOrCreateRouter(data.roomId);
            socket.send(JSON.stringify({
              type: 'roomCreated',
              roomId: data.roomId,
              routerRtpCapabilities: router.rtpCapabilities
            }));
          }
          break;

        case 'create-transport':
          {
            const router = await getOrCreateRouter(data.roomId);
            const peer = createPeer(data.clientId, data.roomId, socket);

            // 创建传输
            const transport = await createWebRtcTransport(router, data.clientId);
            console.log('Transport created for client:', data.clientId);

            socket.send(JSON.stringify({
              type: 'transport-had-been-Created',
              transportOptions: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
              }
            }));
          }
          break;

        case 'connectTransport':
          try {
            console.log('收到连接传输请求:', {
              transportId: data.transportId,
              clientId: data.clientId,
              dtlsParameters: data.dtlsParameters
            });

            const transport = transports.get(data.transportId);
            if (!transport) {
              console.log('现有传输列表:', Array.from(transports.keys()));
              throw new Error(`找不到传输: ${data.transportId}`);
            }

            // 验证 DTLS 参数
            if (!data.dtlsParameters || !Array.isArray(data.dtlsParameters.fingerprints)) {
              console.error('无效的 DTLS 参数:', data.dtlsParameters);
              throw new Error('无效的 DTLS 参数');
            }

            // 连接传输
            await transport.connect({
              dtlsParameters: {
                fingerprints: data.dtlsParameters.fingerprints,
                role: data.dtlsParameters.role || 'auto'
              }
            });

            socket.send(JSON.stringify({
              type: 'transportConnected'
            }));

            // 获取并发送生产者列表
            const producerList = Array.from(producers.values())
              .filter(producer => producer.appData.roomId === data.roomId)
              .map(producer => ({
                id: producer.id,
                kind: producer.kind
              }));

            socket.send(JSON.stringify({
              type: 'producers',
              producers: producerList
            }));

          } catch (error) {
            console.error('连接传输失败:', error);
            socket.send(JSON.stringify({
              type: 'error',
              message: error.message
            }));
          }
          break;

        case 'produce':
          {
            const transport = transports.get(data.transportId);
            if (!transport) {
              throw new Error(`Transport not found: ${data.transportId}`);
            }

            const producer = await transport.produce({
              kind: data.kind,
              rtpParameters: data.rtpParameters,
              appData: { peerId: data.clientId, roomId: data.roomId }
            });

            const peer = peers.get(data.clientId);
            peer.producers.add(producer.id);
            producers.set(producer.id, producer);
            socket.send(JSON.stringify({
              type: 'producerCreated',
              producerId: producer.id
            }));

            // 通知房间内其他人
            broadcastNewProducer(data.roomId, producer.id, data.clientId);
          }
          break;

        case 'consume':
          {
            try {
              const router = rooms.get(data.roomId);
              const producer = producers.get(data.producerId);
  
              if (!router || !producer) {
                throw new Error('Router or producer not found');
              }
  
              if (!router.canConsume({
                producerId: producer.id,
                rtpCapabilities: data.rtpCapabilities
              })) {
                throw new Error('Cannot consume this producer');
              }
  
              const transport = transports.get(data.transportId);
              const consumer = await transport.consume({
                producerId: producer.id,
                rtpCapabilities: data.rtpCapabilities,
                paused: false
              });
  
              const peer = peers.get(data.clientId);
              peer.consumers.add(consumer.id);
              consumers.set(consumer.id, consumer);
              socket.send(JSON.stringify({
                type: 'consumer-created',
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                consumerType: consumer.type,
                producerPaused: consumer.producerPaused
              }));
            } catch (error) {
              console.log('consume error: ', error);
            }
          }
          break;

        case 'getProducers':
          {
            const peer = peers.get(data.clientId);
            const producerList = Array.from(producers.values())
              .filter(producer => producer.appData.roomId === data.roomId)
              .map(producer => ({
                id: producer.id,
                kind: producer.kind
              }));

            socket.send(JSON.stringify({
              type: 'producers',
              producers: producerList
            }));
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      socket.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  socket.on('close', () => {
    console.log('Client disconnected');
    // 清理资源
    for (const [peerId, peer] of peers.entries()) {
      if (peer.socket === socket) {
        cleanupPeer(peerId);
        break;
      }
    }
  });
});

// 辅助函数
const getOrCreateRouter = async (roomId) => {
  let router = rooms.get(roomId);
  if (!router) {
    router = await worker.createRouter({ mediaCodecs });
    rooms.set(roomId, router);
    console.log('Created new router for room:', roomId);
  }
  return router;
};

const createPeer = (peerId, roomId, socket) => {
  const peer = {
    roomId,
    socket,
    transports: new Set(),
    producers: new Set(),
    consumers: new Set()
  };
  peers.set(peerId, peer);
  return peer;
};

const createWebRtcTransport = async (router, clientId) => {
  const transport = await router.createWebRtcTransport(webRtcTransportOptions);

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed' || dtlsState === 'failed' || dtlsState === 'disconnected') {
      transport.close();
    }
  });

  transport.observer.on('close', () => {
    console.log('Transport closed');
    transports.delete(transport.id);
    const peer = peers.get(clientId);
    if (peer) {
      peer.transports.delete(transport.id);
    }
  });
  transports.set(transport.id, transport);

  const peer = peers.get(clientId);
  if (peer) {
    peer.transports.add(transport.id);
  }

  return transport;
};

const broadcastNewProducer = (roomId, producerId, excludePeerId) => {
  console.log('开始通知房间里的其他人---> peer:', peers);
  peers.forEach((peer, peerId) => {
    if (peer.roomId === roomId && peerId !== excludePeerId) {
      peer.socket.send(JSON.stringify({
        type: 'newProducer',
        producerId: producerId
      }));
    }
  });
};

const cleanupPeer = (peerId) => {
  const peer = peers.get(peerId);
  if (!peer) return;

  // 清理传输
  peer.transports.forEach(transportId => {
    const transport = transports.get(transportId);
    if (transport) {
      transport.close();
      transports.delete(transportId);
    }
  });

  // 清理生产者
  peer.producers.forEach(producerId => {
    const producer = producers.get(producerId);
    if (producer) {
      producer.close();
      producers.delete(producerId);
    }
  });

  // 清理消费者
  peer.consumers.forEach(consumerId => {
    const consumer = consumers.get(consumerId);
    if (consumer) {
      consumer.close();
      consumers.delete(consumerId);
    }
  });

  peers.delete(peerId);
};

// 启动服务器
const start = async () => {
  await createWorker();

  const port = 3001;
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
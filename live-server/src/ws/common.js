import { getOrCreateRouter } from './helper.js';
import { webRtcTransportOptions } from '../web-rtc/configs.js';
import { addViewer, getViewerCount, removeViewer } from './helper.js';

/**
 * create common events
*/
function createCommonEvents({
  rooms,
  peers,
  transports,
  producers,
  consumers
}) {
  const createPeer = (clientId, roomId, socket) => {
    const peer = {
      roomId,
      socket,
      transports: new Set(),
      producers: new Set(),
      consumers: new Set()
    };
    peers.set(clientId, peer);
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
  const commonEvents = {
    'createRoom': async (socket, data) => {
      const router = await getOrCreateRouter(data.roomId, rooms);
      socket.send(JSON.stringify({
        type: 'roomCreated',
        roomId: data.roomId,
        routerRtpCapabilities: router.rtpCapabilities
      }));
    },
    'createTransport': async (socket, data) => {
      const router = await getOrCreateRouter(data.roomId, rooms);
      createPeer(data.clientId, data.roomId, socket);

      // 创建webRTC传输通道
      const transport = await createWebRtcTransport(router, data.clientId);
      console.log('Transport created for client:', data.clientId);

      socket.send(JSON.stringify({
        type: 'transportIsCreated',
        transportOptions: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        }
      }));
    },
    'connectTransport': async (socket, data) => {
      try {
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

        // add viewer
        await addViewer(data.roomId, data.clientId);

        const viewers = await getViewerCount(data.roomId);
        socket.send(JSON.stringify({
          type: 'transportConnected',
          viewers
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
    },
    "removeViewer": async (socket, data) => {
      await removeViewer(data.roomId, data.clientId);
      const viewers = await getViewerCount(data.roomId);
      socket.send(JSON.stringify({
        type: 'viewerCount',
        viewers
      }));
    },
  };

  return commonEvents;
}

export default createCommonEvents;
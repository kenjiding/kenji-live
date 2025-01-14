import { getOrCreateRouter } from './helper.js';

/**
 * create consumer events
*/
function createConsumerEvents({
  rooms,
  peers,
  transports,
  producers,
  consumers
}) {
  const consumerEvents = {
    'getRouterRtpCapabilities': async (socket, data) => {
      const router = await getOrCreateRouter(data.roomId, rooms);
      socket.send(JSON.stringify({
        type: 'routerRtpCapabilities',
        rtpCapabilities: router.rtpCapabilities
      }));
    },
    'consume': async (socket, data) => {
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
    },
    'getProducers': async (socket, data) => {
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
    },
  };
  return consumerEvents;
}

export default createConsumerEvents;
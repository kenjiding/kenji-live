/**
 * create producer events
*/
function createProducerEvents({
  rooms,
  peers,
  transports,
  producers,
  consumers
}) {
  const broadcastNewProducer = (roomId, producerId, excludeClientId) => {
    peers.forEach((peer, clientId) => {
      if (peer.roomId === roomId && clientId !== excludeClientId) {
        peer.socket.send(JSON.stringify({
          type: 'newProducer',
          producerId: producerId
        }));
      }
    });
  };

  const producerEvents = {
    'produce': async (socket, data) => {
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
    },
    'stopStreaming': async (socket, data) => {
      const producersToRemove = Array.from(producers.values())
        .filter(producer =>
          producer.appData.clientId === data.clientId &&
          producer.appData.roomId === data.roomId
        );

      producersToRemove.forEach(producer => {
        producer.close();
        producers.delete(producer.id);
      });

      // 广播给房间内其他成员
      peers.forEach((peer, peerId) => {
        if (peer.roomId === data.roomId && peerId !== data.clientId) {
          peer.socket.send(JSON.stringify({
            type: 'livestreamStopped',
            producerIds: producersToRemove.map(p => p.id)
          }));
        }
      });
    }
  };

  return producerEvents;
}

export default createProducerEvents;

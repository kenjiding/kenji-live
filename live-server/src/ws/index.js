import { WebSocketServer } from 'ws';
import createConsumerEvents from './consumers.js';
import createProducerEvents from './producers.js';
import createCommonEvents from './common.js';

// global state
const rooms = new Map(); // roomId => Router
const peers = new Map();  // peerId => { roomId, socket, transports[], producers[], consumers[] }
const transports = new Map(); // transportId => Transport
const producers = new Map();  // producerId => Producer
const consumers = new Map();  // consumerId => Consumer

const params = {
  rooms,
  peers,
  transports,
  producers,
  consumers
};

const events = {
  ...createCommonEvents(params),
  ...createProducerEvents(params),
  ...createConsumerEvents(params),
};

export const wsInit = ({
  server
}) => {
  const wss = new WebSocketServer({ server });

  // WebSocket connection
  wss.on('connection', async (socket) => {
    console.log('New WebSocket connection');
    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        console.log('Received message:', data);
        const type = data.type;
        const handler = events[type];
        handler && handler(socket, data);
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
      // cleanup peer
      for (const [peerId, peer] of peers.entries()) {
        if (peer.socket === socket) {
          cleanupPeer(peerId);
          break;
        }
      }
    });
  });
}

function cleanupPeer(peerId) {
  const peer = peers.get(peerId);
  if (!peer) return;

  // cleanup transports
  peer.transports.forEach(transportId => {
    const transport = transports.get(transportId);
    if (transport) {
      transport.close();
      transports.delete(transportId);
    }
  });

  // cleanup producers
  peer.producers.forEach(producerId => {
    const producer = producers.get(producerId);
    if (producer) {
      producer.close();
      producers.delete(producerId);
    }
  });

  // cleanup consumers
  peer.consumers.forEach(consumerId => {
    const consumer = consumers.get(consumerId);
    if (consumer) {
      consumer.close();
      consumers.delete(consumerId);
    }
  });

  peers.delete(peerId);
};
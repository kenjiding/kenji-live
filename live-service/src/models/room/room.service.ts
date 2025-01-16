import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types';

interface Room {
  id: string;
  peers: Map<string, Peer>;
}

interface Peer {
  id: string;
  name: string;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

@Injectable()
export class RoomService {
  private rooms: Map<string, Room> = new Map();

  createRoom(roomId: string): string {
    this.rooms.set(roomId, {
      id: roomId,
      peers: new Map(),
    });
    return roomId;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  addPeer(roomId: string, name: string): Peer {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const peerId = uuidv4();
    const peer: Peer = {
      id: peerId,
      name,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };

    room.peers.set(peerId, peer);
    return peer;
  }

  addTransport(roomId: string, peerId: string, transport: WebRtcTransport) {
    const peer = this.getPeer(roomId, peerId);
    peer.transports.set(transport.id, transport);
  }

  addProducer(roomId: string, peerId: string, producer: Producer) {
    const peer = this.getPeer(roomId, peerId);
    peer.producers.set(producer.id, producer);
  }

  addConsumer(roomId: string, peerId: string, consumer: Consumer) {
    const peer = this.getPeer(roomId, peerId);
    peer.consumers.set(consumer.id, consumer);
  }

  getPeer(roomId: string, peerId: string): Peer {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const peer = room.peers.get(peerId);
    if (!peer) {
      throw new Error('Peer not found');
    }

    return peer;
  }

  removePeer(roomId: string, peerId: string) {
    const room = this.getRoom(roomId);
    if (!room) {
      return;
    }

    const peer = room.peers.get(peerId);
    if (!peer) {
      return;
    }

    // 清理所有相关资源
    peer.consumers.forEach((consumer) => consumer.close());
    peer.producers.forEach((producer) => producer.close());
    peer.transports.forEach((transport) => transport.close());

    room.peers.delete(peerId);

    // 如果房间为空，删除房间
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  getProducers(roomId: string): Producer[] {
    const room = this.getRoom(roomId);
    if (!room) {
      return [];
    }

    const producers: Producer[] = [];
    room.peers.forEach((peer) => {
      peer.producers.forEach((producer) => {
        producers.push(producer);
      });
    });

    return producers;
  }
}

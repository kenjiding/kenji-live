
import { Injectable } from '@nestjs/common';
import {
  WebRtcTransport,
  Producer,
  Consumer,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  Router
} from 'mediasoup/node/lib/types';
import { Peer } from '../interfaces';

@Injectable()
export class RoomService {
  public rooms: Map<string, Router> = new Map();
  public producers: Map<string, Producer> = new Map();
  public consumers: Map<string, Consumer> = new Map();
  public transports: Map<string, WebRtcTransport> = new Map();
  public peers: Map<string, Peer> = new Map();

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }
  
  setRoom(roomId, router) {
    this.rooms.set(roomId, router);
  }

  createPeer(clientId, roomId) {
    const peer: Peer = {
      roomId,
      transports: new Set(),
      producers: new Set(),
      consumers: new Set(),
    };
    this.peers.set(clientId, peer);
    return peer;
  }

  getProducerList(roomId) {
    return Array.from(this.producers.values())
      .filter((producer) => producer.appData.roomId === roomId)
      .map((producer) => ({
        id: producer.id,
        kind: producer.kind,
      }));
  }

  async getProducerIds({
    clientId,
    roomId
  }) {
    const producersToRemove = Array.from(this.producers.values()).filter(
      (producer) =>
        producer.appData.clientId === clientId &&
        producer.appData.roomId === roomId,
    );

    producersToRemove.forEach((producer) => {
      producer.close();
      this.producers.delete(producer.id);
    });

    return producersToRemove.map((p) => p.id);
  }

  async createProduce({
    kind,
    roomId,
    transportId,
    clientId,
    rtpParameters,
  }) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = await transport.produce({
      kind: kind,
      rtpParameters: rtpParameters,
      appData: { peerId: clientId, roomId: roomId },
    });

    const peer = this.peers.get(clientId);
    peer.producers.add(producer.id);
    this.producers.set(producer.id, producer);
    return producer;
  }

}
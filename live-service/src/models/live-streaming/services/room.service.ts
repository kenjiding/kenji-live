
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
  private rooms: Map<string, Router> = new Map();
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

}
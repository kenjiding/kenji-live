import { Injectable } from '@nestjs/common';
import {
  WebRtcTransport,
  Producer,
  Consumer,
  Router,
  Transport,
} from 'mediasoup/node/lib/types';
import { Peer } from '../interfaces';

@Injectable()
export class RoomService {
  public rooms: Map<string, Router> = new Map();
  public producers: Map<string, Producer> = new Map();
  public consumers: Map<string, Consumer> = new Map();
  public transports: Map<string, Transport> = new Map(); // 支持 PlainRtpTransport
  public peers: Map<string, Peer> = new Map();

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }
  
  setRoom(roomId, router) {
    this.rooms.set(roomId, router);
  }

  async closeRoomResources({ clientId, roomId }: { clientId: string; roomId: string }) {
    const producersToRemove = Array.from(this.producers.values()).filter(
      (producer) => producer.appData.clientId === clientId && producer.appData.roomId === roomId,
    );
    const consumersToRemove = Array.from(this.consumers.values()).filter(
      (consumer) => consumer.appData?.roomId === roomId && producersToRemove.some((p) => p.id === consumer.producerId),
    );
    const transportsToRemove = Array.from(this.transports.values()).filter(
      (transport) => transport.appData?.roomId === roomId,
    );

    producersToRemove.forEach((producer) => {
      producer.close();
      this.producers.delete(producer.id);
      console.log(`Producer ${producer.id} closed for room ${roomId}`);
    });

    consumersToRemove.forEach((consumer) => {
      consumer.close();
      this.consumers.delete(consumer.id);
      console.log(`Consumer ${consumer.id} closed for room ${roomId}`);
    });

    transportsToRemove.forEach((transport) => {
      // const rtpPort = transport.tuple?.localPort;
      // const rtcpPort = transport.rtcpTuple?.localPort;
      transport.close();
      this.transports.delete(transport.id);
      // console.log(`Transport ${transport.id} closed for room ${roomId}, released ports RTP: ${rtpPort}, RTCP: ${rtcpPort}`);
    });

    return producersToRemove.map((p) => p.id);
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

    // 关闭相关 Consumer 和 PlainRtpTransport
    const consumersToRemove = Array.from(this.consumers.values()).filter(
      (consumer) =>
        consumer.appData?.roomId === roomId &&
        producersToRemove.some((p) => p.id === consumer.producerId),
    );

    producersToRemove.forEach((producer) => {
      producer.close();
      this.producers.delete(producer.id);
    });

    consumersToRemove.forEach((consumer) => {
      const transportId = consumer.appData?.transportId as string | undefined;
      if (transportId) {
        const transport = this.transports.get(transportId);
        if (transport) {
          transport.close();
          this.transports.delete(transportId);
        }
      }
      consumer.close();
      this.consumers.delete(consumer.id);
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
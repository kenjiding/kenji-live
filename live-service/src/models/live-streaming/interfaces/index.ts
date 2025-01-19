
export interface Peer {
  roomId;
  transports: Set<string>;
  producers: Set<string>;
  consumers: Set<string>;
}

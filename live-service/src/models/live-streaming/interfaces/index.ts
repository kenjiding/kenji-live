import { Socket } from "socket.io";

export interface Peer {
  roomId;
  socket: Socket;
  transports: Set<string>;
  producers: Set<string>;
  consumers: Set<string>;
}

export interface RoomInfo {
  broadcaster: string;
  viewers: Set<string>;
}

export interface SocketEvents {
  'join-room': (roomId: string, userId: string) => void;
  'broadcast-offer': (offer: RTCSessionDescriptionInit, roomId: string) => void;
  'send-answer': (data: {
    answer: RTCSessionDescriptionInit,
    roomId: string,
    userId: string | undefined
  }) => void;
  'ice-candidate': (candidate: RTCIceCandidate, roomId: string) => void;
  'user-connected': (userId: string) => void;
  'receive-offer': (offer: RTCSessionDescriptionInit) => void;
  'receive-answer': (data: {
    answer: RTCSessionDescriptionInit;
    userId: string,
  }) => void;
  'receive-ice-candidate': (candidate: RTCIceCandidate) => void;
  'broadcaster-left': () => void;
}
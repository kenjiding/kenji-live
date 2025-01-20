import useInteractive from "./useInteractive";
import useStreaming from "./useStreaming";
import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, RefObject } from 'react';
import { Device } from 'mediasoup-client';
import { useLiveContext } from '@/hooks/useLiveContext';

const useViewerLive = ({
  roomId,
  // wsRef,
  interactiveVideoRef,
  videoRef,
}: {
  roomId: string | string[] | undefined;
  // wsRef: Socket | null,
  interactiveVideoRef: RefObject<HTMLVideoElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
}) => {
  const deviceRef = useRef<Device | null>(null);

  useStreaming({
    roomId,
    videoRef,
    deviceRef,
  });
  useInteractive({
    roomId,
    videoRef: interactiveVideoRef,
    deviceRef,
  });

  return {
  };

}

export default useViewerLive;
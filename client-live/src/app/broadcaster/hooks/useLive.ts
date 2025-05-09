import useBroadcasterStreaming from "./useBroadcasterStreaming";
import useLiveInteractive from "./useLiveInteractive";
import { io, Socket } from 'socket.io-client';
import { useEffect, RefObject } from 'react';
import { Device } from 'mediasoup-client';
import { useLiveContext } from '@/hooks/useLiveContext';

const useLive = ({
  roomId,
  deviceRef,
  interactiveVideoRef,
  videoRef,
}: {
  roomId: string | string[] | undefined;
  interactiveVideoRef: RefObject<HTMLVideoElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  deviceRef: RefObject<Device | null>,
}) => {

  const {
    transportRef,
    producersRef,
  } = useBroadcasterStreaming({
    roomId,
    deviceRef,
  });

  const {
    interactiveInfo,
  } = useLiveInteractive({
    roomId,
    interactiveVideoRef
  });

  return {
    transportRef,
    producersRef,
    interactiveInfo
  };
}

export default useLive;
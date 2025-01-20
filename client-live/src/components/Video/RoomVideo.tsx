"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import { TransportConnectedSuccess } from '@/types/room.types';
// import useStreaming from './hooks/useStreaming';
import useViewerLive from './hooks/useViewerLive';
import { useLiveContext } from '@/hooks/useLiveContext';

interface RoomVideoProps {
  roomId: string | string[] | undefined;
  webRTCConnectSuccess?: (data: TransportConnectedSuccess) => {},
  webRTCConnectError?: (data: any) => {},
  liveStreamingStop?: () => {},
}

export default function RoomVideo({
  roomId,
  webRTCConnectSuccess,
  liveStreamingStop,
}: RoomVideoProps) {
  const [connectionInfo, setConnectionInfo] = useState<{
    websocket: string;
    webRTC: string;
  }>({
    websocket: '未连接',
    webRTC: '未连接',
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const interactiveVideoRef = useRef<HTMLVideoElement>(null);
  const { ws, isConnected, emit } = useLiveContext();


  // const {
  //   videoRef,
  //   wsRef,
  // } = useStreaming({
  //   roomId,
  // });


  const {
    // deviceRef,
    // transportRef,
  } = useViewerLive({
    roomId,
    videoRef: videoRef,
    interactiveVideoRef: interactiveVideoRef,
  });



  const lianmai = () => {
    ws?.emit('requestInteractive', {
      roomId,
      userId: 'a123'
    });
  }


  return (
    <div>
      <div className="mb-4 flex justify-center">
        <h1>观看video</h1>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="bg-black"
          style={{ border: '1px solid #ccc' }}
        />
      </div>
      <div className="mb-4 flex justify-center">
        <h1>连麦video</h1>
        <button className='p-5 bg-slate-700' onClick={lianmai}>连麦</button>
        <video
          ref={interactiveVideoRef}
          autoPlay
          playsInline
          className="bg-black"
          style={{ border: '1px solid #ccc' }}
        />
      </div>

      {/* <div className="mt-4 space-y-2 text-sm p-5">
        <p>服务器连接状态: {connectionInfo.websocket}</p>
        <p>webRTC连接状态: {connectionInfo.webRTC}</p>
      </div> */}
    </div>
  );
}
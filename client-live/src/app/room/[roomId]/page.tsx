// pages/viewer.tsx
"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters } from 'mediasoup-client/lib/types';
import RoomVideo from '@/components/Video/RoomVideo';

export default function Viewer() {
  const { roomId } = useParams();
  const [connectionInfo, setConnectionInfo] = useState<{
    websocket: string;
    webRTC: string;
  }>({
    websocket: '未连接',
    webRTC: '未连接',
  });
  return (
    <div>
      {/* <RoomVideo roomId={roomId}></RoomVideo> */}
      <div className="mt-4 space-y-2 text-sm">
        <p>服务器连接状态: {connectionInfo.websocket}</p>
        <p>webRTC连接状态: {connectionInfo.webRTC}</p>
      </div>
    </div>
  );
}
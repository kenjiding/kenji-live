"use client";
import { useRef, useState } from 'react';
import { TransportConnectedSuccess } from '@/types/room.types';
import useViewerLive from './hooks/useViewerLive';
import { useLiveContext } from '@/hooks/useLiveContext';
import { CircleMinus, RefreshCcw, CirclePlus } from 'lucide-react';
import TooltipWrapper from '@/components/TooltipWrapper';
import { useToast } from "@/hooks/use-toast"

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
  const { wsInterativeRef, isConnected, emit } = useLiveContext();
  const [isInteractive, setIsInteractive] = useState(false);
  const { toast } = useToast()

  const acceptInteractive = () => {
    console.log('观看端发起连麦请求');
    wsInterativeRef?.emit('requestInteractive', {
      roomId,
      userId: 'a123'
    });
    toast({
      title: "发起连麦请",
      description: "已经发起连麦请",
      action: <div>success</div>,
    });
  }

  useViewerLive({
    roomId,
    videoRef: videoRef,
    interactiveVideoRef: interactiveVideoRef,
    interactiveAcceptedHandler: () => {
      setIsInteractive(!isInteractive);
    }
  });


  return (
    <div className='relative group'>
      {/* 主播视频容器 */}
      <div className="mb-4 flex">
        {/* 左侧主播视频 - flex-1 使其平分宽度 */}
        <div className={`flex-1 flex ${isInteractive ? 'justify-end mr-1' : 'justify-center'}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="bg-black w-[270px] h-[480px] object-contain"
            style={{
              border: '1px solid #ccc',
              aspectRatio: '9/16'
            }}
          />
        </div>

        {/* 右侧连麦视频 - flex-1 使其平分宽度 */}
        {isInteractive && (
          <div className="flex-1 flex justify-start">
            <video
              ref={interactiveVideoRef}
              autoPlay
              playsInline
              className="bg-black w-[270px] h-[480px] object-contain"
              style={{
                border: '1px solid #ccc',
                aspectRatio: '9/16'
              }}
            />
          </div>
        )}
      </div>

      {/* 控制按钮 */}
      <div className='absolute flex w-full bottom-0 left-0 opacity-0
        group-hover:opacity-100 transition-opacity duration-500
        p-3'>
        <div className='flex-1 flex items-center cursor-pointer'>
          <TooltipWrapper text='刷新'>
            <RefreshCcw />
          </TooltipWrapper>
        </div>
        <div className='flex-1 flex justify-end cursor-pointer'>
          {isInteractive ?
            <TooltipWrapper text='退出连麦'>
              <CircleMinus />
            </TooltipWrapper>
            :
            <TooltipWrapper text='连麦'>
              <CirclePlus onClick={acceptInteractive} />
            </TooltipWrapper>
          }
        </div>
      </div>
    </div>
  );
}
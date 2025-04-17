"use client";
import { useRef, useState, useEffect } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import useLive from '../hooks/useLive';
import { useLiveContext } from '@/hooks/useLiveContext';
import { 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  Users, 
  X, 
  RefreshCw, 
  Check, 
  Link2, 
  Settings,
  Play
} from 'lucide-react';

// 定义接口类型
interface InteractiveInfo {
  userId: string | null;
  [key: string]: any;
}

export default function Broadcaster() {
  const { roomId } = useParams<{ roomId: string }>();
  const { ws: wsRef, wsInterativeRef, isConnected, emit } = useLiveContext();
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [requestNotification, setRequestNotification] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const interactiveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const [isInteractive, setIsInteractive] = useState<boolean>(false);

  const {
    transportRef,
    producersRef,
    interactiveInfo
  } = useLive({
    roomId,
    deviceRef,
    videoRef: videoRef,
    interactiveVideoRef: interactiveVideoRef
  });

  // 显示连麦请求通知
  useEffect(() => {
    if (interactiveInfo.userId) {
      setRequestNotification(true);
      // 5秒后自动隐藏通知
      const timer = setTimeout(() => {
        setRequestNotification(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [interactiveInfo.userId]);

  const startStreaming = async () => {
    try {
      if (!deviceRef.current?.canProduce('video')) {
        throw new Error('Cannot produce video');
      }
      if (!deviceRef.current?.loaded) {
        throw new Error('Device not loaded');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 0.5625 },
        },
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 2,
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const transport = transportRef.current;

      if (!transport) {
        throw new Error('Transport not ready');
      }

      // 创建视频 Producer
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track available');
      }
      
      const videoProducer = await transport.produce({
        kind: 'video',
        track: videoTrack,
        rtpParameters: {
          codecs: [
            {
              mimeType: 'video/H264',
              clockRate: 90000,
              parameters: {
                'profile-level-id': '42e01f',
                'x-google-start-bitrate': 1000
              }
            }
          ],
          encodings: [
            {
              rid: 'r0',
              maxBitrate: 500000,
              scaleResolutionDownBy: 1
            }
          ]
        }
      });

      videoProducer.on('transportclose', () => {
        console.log('Video producer transport closed');
        videoProducer.close();
      });

      videoProducer.on('trackended', () => {
        console.log('Video track ended');
        videoProducer.close();
      });

      // 创建音频 Producer
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track available');
      }
      
      const audioProducer = await transport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: 1,
          opusDtx: 1,
          opusFec: 1,
          opusMaxPlaybackRate: 48000
        }
      });

      audioProducer.on('transportclose', () => {
        console.log('Audio producer transport closed');
        audioProducer.close();
      });

      audioProducer.on('trackended', () => {
        console.log('Audio track ended');
        audioProducer.close();
      });

      producersRef.current.set('video', videoProducer);
      producersRef.current.set('audio', audioProducer);

      setIsStreaming(true);
    } catch (error) {
      console.error('Error starting stream:', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const stopStreaming = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const videoProducer = producersRef.current.get('video');
      const audioProducer = producersRef.current.get('audio');

      if (videoProducer) {
        videoProducer.close();
        producersRef.current.delete('video');
      }

      if (audioProducer) {
        audioProducer.close();
        producersRef.current.delete('audio');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      wsRef?.emit('stopStreaming', {
        roomId,
      });

      setIsStreaming(false);
    } catch (error) {
      console.error('Error stopping stream:', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const allowInteractive = () => {
    if (wsInterativeRef) {
      wsInterativeRef.emit('allowInteractive', { roomId });
      console.log('主播允许连麦');
      setRequestNotification(false);
      setIsInteractive(true);
    }
  };

  const endInteractive = () => {
    // 实现结束连麦的逻辑
    if (wsInterativeRef) {
      wsInterativeRef.emit('endInteractive', { roomId });
      setIsInteractive(false);
    }
  };

  const refreshStream = async () => {
    // 实现刷新流的逻辑
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        try {
          // 重新获取媒体流
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 720 },
              height: { ideal: 1280 },
              aspectRatio: { ideal: 0.5625 },
            }
          });
          
          const newVideoTrack = newStream.getVideoTracks()[0];
          if (newVideoTrack && streamRef.current) {
            // 使用旧的音频轨道
            const oldAudioTracks = streamRef.current.getAudioTracks();
            
            // 创建一个新的MediaStream
            const combinedStream = new MediaStream();
            
            // 添加新的视频轨道
            combinedStream.addTrack(newVideoTrack);
            
            // 添加旧的音频轨道
            oldAudioTracks.forEach(track => {
              combinedStream.addTrack(track);
            });
            
            // 更新流引用
            streamRef.current = combinedStream;
            
            // 更新视频源
            if (videoRef.current) {
              videoRef.current.srcObject = combinedStream;
            }
            
            // 更新视频Producer
            const videoProducer = producersRef.current.get('video');
            if (videoProducer) {
              await videoProducer.replaceTrack({ track: newVideoTrack });
            }
          }
        } catch (error) {
          console.error('Error refreshing video stream:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen bg-gray-900 p-4">
      {/* 状态行和连麦请求通知 */}
      <div className="flex justify-between items-center mb-2">
        {/* 直播状态指示器 */}
        <div className="flex items-center">
          {isStreaming && (
            <div className="flex items-center">
              <div className="h-3 w-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
              <span className="text-white text-sm font-medium">living</span>
            </div>
          )}
        </div>
        
        {/* 连麦请求通知 - 小型内联显示 */}
        {requestNotification && interactiveInfo.userId && (
          <div className="flex items-center bg-blue-600 text-white py-1 px-3 rounded-lg text-sm">
            <Users size={16} className="mr-1" />
            <span className="mr-2">{interactiveInfo.userId} Request to join</span>
            <div className="flex space-x-1">
              <button 
                onClick={() => setRequestNotification(false)}
                className="p-1 rounded-full hover:bg-blue-700"
              >
                <X size={14} />
              </button>
              <button 
                onClick={allowInteractive}
                className="p-1 rounded-full hover:bg-green-600"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 主要内容区 - 视频容器和控制按钮 */}
      <div className="flex flex-col items-center">
        {/* 视频容器 - 减小高度 */}
        <div className="relative w-full max-w-md flex justify-center mb-3">
          <div className={`relative ${isInteractive ? 'w-1/2 pr-1' : 'w-full'}`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className={`bg-black w-full rounded-lg shadow-lg ${isVideoOff ? 'opacity-60' : ''}`}
              style={{ maxHeight: '60vh', aspectRatio: '9/16' }}
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-gray-900 bg-opacity-70 p-3 rounded-full">
                  <VideoOff size={32} className="text-white" />
                </div>
              </div>
            )}
          </div>

          {isInteractive && interactiveInfo.userId && (
            <div className="w-1/2 pl-1">
              <div className="relative">
                <video
                  ref={interactiveVideoRef}
                  autoPlay
                  playsInline
                  className="bg-black w-full rounded-lg shadow-lg"
                  style={{ maxHeight: '60vh', aspectRatio: '9/16' }}
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white px-2 py-1 text-xs rounded">
                  {interactiveInfo.userId}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 结合所有控制功能到一个控制面板 */}
        <div className="w-full max-w-md bg-gray-800 bg-opacity-90 rounded-lg p-3 mb-3">
          {/* 主要控制按钮行 */}
          <div className="flex justify-between items-center">
            <button 
              onClick={toggleMute} 
              className="flex flex-col items-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              {isMuted ? <MicOff className="text-red-500 mb-1" size={20} /> : <Mic className="text-white mb-1" size={20} />}
              <span className="text-xs text-gray-300">{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            
            <button 
              onClick={toggleVideo} 
              className="flex flex-col items-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              {isVideoOff ? <VideoOff className="text-red-500 mb-1" size={20} /> : <Video className="text-white mb-1" size={20} />}
              <span className="text-xs text-gray-300">{isVideoOff ? 'Start video' : 'Stop video'}</span>
            </button>
            
            <button 
              onClick={refreshStream} 
              className="flex flex-col items-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RefreshCw className="text-white mb-1" size={20} />
              <span className="text-xs text-gray-300">refresh</span>
            </button>
            
            {isInteractive ? (
              <button 
                onClick={endInteractive} 
                className="flex flex-col items-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="text-red-400 mb-1" size={20} />
                <span className="text-xs text-gray-300">Leave call</span>
              </button>
            ) : (
              <button 
                onClick={() => setRequestNotification(true)} 
                className="flex flex-col items-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Link2 className="text-white mb-1" size={20} />
                <span className="text-xs text-gray-300">	Join call </span>
              </button>
            )}
            
            <button 
              className="flex flex-col items-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings className="text-white mb-1" size={20} />
              <span className="text-xs text-gray-300">Setting</span>
            </button>
          </div>
          
          {/* 开始/停止直播按钮 */}
          <div className="mt-3 flex justify-center">
            <button
              onClick={isStreaming ? stopStreaming : startStreaming}
              disabled={!isConnected}
              className={`w-full py-2 rounded-lg font-medium transition-all duration-300 ${
                isStreaming 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center`}
            >
              {isStreaming ? (
                <>
                  <X size={18} className="mr-2" />
                  <span>End Live</span>
                </>
              ) : (
                <>
                  <Play size={18} className="mr-2" />
                  <span>Start Live</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
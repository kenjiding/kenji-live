"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import useLive from '../hooks/useLive'; 
import { useLiveContext } from '@/hooks/useLiveContext';

export default function Broadcaster() {
  const { roomId } = useParams();
  const { ws: wsRef, isConnected, emit } = useLiveContext();
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const interactiveVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const deviceRef = useRef<Device | null>(null);

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

  const startStreaming = async () => {
    try {
      console.log('deviceRef.current: ', deviceRef.current);

      if (!deviceRef.current?.canProduce('video')) {
        throw new Error('Cannot produce video');
      }
      if (!deviceRef.current?.loaded) {
        throw new Error('Device not loaded');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },   // 理想宽度
          height: { ideal: 1080 },  // 理想高度
          frameRate: { ideal: 30 }  // 理想帧率
        },
        audio: {
          noiseSuppression: true,   // 消除背景噪音
          echoCancellation: true,   // 回声抑制
          autoGainControl: true,    // 自动增益控制
          sampleRate: 48000,        // 采样率（Hz）
          sampleSize: 16,           // 采样精度（bits）
          channelCount: 2,          // 声道数量（1 为单声道，2 为立体声）
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const transport = transportRef.current;
      console.log('transport: ', transport);

      if (!transport) {
        throw new Error('Transport not ready');
      }

      // 创建视频 Producer 并保存引用
      const videoTrack = stream.getVideoTracks()[0];
      const videoProducer = await transport.produce({
        kind: 'video',
        track: videoTrack,  // 媒体轨道
        rtpParameters: {
          codecs: [
            {
              mimeType: 'video/H264',
              clockRate: 90000,
              parameters: {
                // 编码参数
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

      // 设置视频生产者的事件监听
      videoProducer.on('transportclose', () => {
        console.log('Video producer transport closed');
        videoProducer.close();
      });

      videoProducer.on('trackended', () => {
        console.log('Video track ended');
        videoProducer.close();
      });

      // 创建音频 Producer 并保存引用
      const audioTrack = stream.getAudioTracks()[0];
      const audioProducer = await transport.produce({
        track: audioTrack,
        codecOptions: {
          opusStereo: 1,
          opusDtx: 1,
          opusFec: 1,
          opusMaxPlaybackRate: 48000
        }
      });

      // 设置音频生产者的事件监听
      audioProducer.on('transportclose', () => {
        console.log('Audio producer transport closed');
        audioProducer.close();
      });

      audioProducer.on('trackended', () => {
        console.log('Audio track ended');
        audioProducer.close();
      });
      console.log(1, 'Video track:', videoTrack.getSettings()); // 检查视频轨道设置
      console.log(2, 'Audio track:', audioTrack.getSettings()); // 检查音频轨道设置
  
      // 保存生产者引用
      producersRef.current.set('video', videoProducer);
      producersRef.current.set('audio', audioProducer);

      setIsStreaming(true);
    } catch (error: any) {
      console.error('Error starting stream:', error);
    }
  };

  const stopStreaming = async () => {
    try {
      // 停止所有媒体轨道
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: any) => track.stop());
        streamRef.current = null;
      }

      // 关闭视频和音频 Producers
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

      // 清空视频播放
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      // 向服务器发送停止直播的消息
      wsRef?.emit('stopStreaming', {
        roomId,
      });

      // 重置状态
      setIsStreaming(false);
    } catch (error) {
      console.error('Error stopping stream:', error);
    }
  };

  const allowInteractive = () => {
    wsRef?.emit('allowInteractive', {roomId});
    console.log(wsRef, '主播允许连麦: ');
  }

  return (
    <div className="p-10">
      <h1 className="text-2xl mb-4">主播端</h1>
      <div className="w-3/4 m-auto mb-4 flex justify-center relative">
        <div className='absolute top-0 left-0 w-full pt-3 p-3 pl-5 pr-5'>
          <span className='text-sm text-red-500 py-1 px-2 bg-slate-200 opacity-70'>{ isStreaming ? '正在直播' : '未开播'}</span>
          {/* <span className='text-sm text-blue-800 py-1 px-2 bg-orange-300 ml-3'>观看: {viewers}</span> */}
        </div>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full bg-black"
        />
      </div>

      <div>
          <button
            onClick={isStreaming ? stopStreaming : startStreaming}
            disabled={!isConnected}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
          >
            {isStreaming ? '停止直播' : '开始直播'}
          </button>
        </div>

      <div className="w-3/4 m-auto mb-4 relative">
        <h1 className='text-2xl'>连麦视频</h1>
        <video
          ref={interactiveVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full bg-black"
        />
      </div>
      <div className="flex gap-4 p-10">
        <div className="mt-4 text-sm text-gray-600">
          连接状态: {isConnected ? '已连接' : '未连接'}
        </div>

        { 
          interactiveInfo.userId && <div>
            <button
              onClick={allowInteractive}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
            >
              {`${interactiveInfo.userId} 请求连麦`}
            </button>
          </div>
        }
      </div>
    </div>
  );
}
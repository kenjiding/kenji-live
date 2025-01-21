"use client";
import { useEffect, useRef, useState, RefObject } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import { TransportConnectedSuccess } from '@/types/room.types';
import { useLiveContext } from '@/hooks/useLiveContext';

interface RoomVideoProps {
  roomId: string | string[] | undefined,
  videoRef: RefObject<HTMLVideoElement | null>,
  // deviceRef: RefObject<Device | null>,
  interactiveAcceptedHandler?: () => void,
  webRTCConnectSuccess?: (data: TransportConnectedSuccess) => {},
  webRTCConnectError?: (data: any) => {},
  liveStreamingStop?: () => {},
}

export default function useInteractive({
  roomId,
  interactiveAcceptedHandler,
  liveStreamingStop,
  // deviceRef,
  videoRef
}: RoomVideoProps) {
  const { wsInterativeRef, isInteractiveConnected, emit } = useLiveContext();
  const deviceRef = useRef<Device | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<{
    websocket: string;
    webRTC: string;
  }>({
    websocket: '未连接',
    webRTC: '未连接',
  });
  const sendTransportRef = useRef<any>(null);
  const producersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`viewer-interactive-${Date.now()}`);

  const changeConnectionInfo = (key: 'websocket' | 'webRTC', value: string) => {
    setConnectionInfo((state) => ({
      ...state,
      [key]: value,
    }));
  }
  
  useEffect(() => {
    if (!wsInterativeRef || !isInteractiveConnected) return;
    console.log('观看端连麦ws服务已经连接');
    wsInterativeRef?.emit('createRoom', {roomId});
    const events = {
      'interactiveAccepted': async (data: any) => {
        // const transport = await createProducerTransport();
        const device = new Device();
        await device.load({ routerRtpCapabilities: data.routerRtpCapabilities });
        deviceRef.current = device;
        wsInterativeRef?.emit('createTransport', {
          roomId,
          clientId: clientId.current,
        });
        interactiveAcceptedHandler && interactiveAcceptedHandler();
      },
      'transportIsCreated': async (data: {
        transportOptions: TransportOptions,
        viewerSideType: string,
      }) => {
        try {
          if (!deviceRef) {
            throw new Error('Device not initialized');
          }

          if(!deviceRef.current?.loaded) {
            throw new Error('设备还没有加载成功');
          }
          const transport = deviceRef.current.createSendTransport({
            id: data.transportOptions.id,
            iceParameters: data.transportOptions.iceParameters,
            iceCandidates: data.transportOptions.iceCandidates,
            dtlsParameters: data.transportOptions.dtlsParameters,
          });

          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              console.log(3, 'webrtc通道连接成功');
              const params: TransportConnectedSuccess = {
                dtlsParameters,
                transportId: transport.id,
                clientId: clientId.current,
                roomId,
              };
              wsInterativeRef?.emit('connectTransport', params);
              callback();
            } catch (error) {
              errback(error as Error);
            }
          });

          transport.on('produce', async (parameters: any, callback, errback) => {
            try {
              console.log(4, 'webrtc开始推音频流');
              wsInterativeRef?.emit('produce', {
                type: 'produce',
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                transportId: transport.id,
                clientId: clientId.current,
                roomId
              });

              // 等待服务器返回 producerId，不然无法完成 Producer 创建的最后一步
              const onProducerCreated = (res: any) => {
                callback({ id: res.producerId });
                wsInterativeRef?.off('producerCreated', onProducerCreated);
              };

              wsInterativeRef?.on('producerCreated', onProducerCreated);
            } catch (error) {
              errback(error as Error);
            }
          });

          sendTransportRef.current = transport;

          if (sendTransportRef.current) {
            startStreaming();
          }
        } catch (error: any) {
          console.error('创建传输错误:', error);
        }
      },
      'producerCreated': async (data: {
        producerId: string,
      }) => {
      },
      'transportConnected': async (data: {
        viewers: number
      }) => {
        console.log('传输已连接, 等待媒体流...');
        changeConnectionInfo('webRTC', '传输已连接, 等待媒体流...');
      },
      'livestreamStopped': async () => {
        stopStreaming();
      },
      'viewerCount': async (data: { viewers: number }) => {
      },
      'error': async (data: { message: string }) => {
        console.error('服务器错误:', data.message);
      },
      'connect_error': (error: Error) => {
        wsInterativeRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
        console.error('WebSocket错误:', error);
      },
      'disconnect': () => {
        wsInterativeRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
        console.log('WebSocket已关闭');
        changeConnectionInfo('websocket', '连接已关闭');
      }
    };

    // on events
    Object.entries(events).forEach(([event, handler]) => {
      wsInterativeRef?.on(event, handler);
    });

    return () => {
      // off events
      Object.entries(events).forEach(([event, handler]) => {
        wsInterativeRef?.off(event, handler);
      });
      wsInterativeRef && wsInterativeRef.close();
      stopStreaming();
    };
  }, [isInteractiveConnected]);

  const stopStreaming = () => {
    // 清空视频源
    if (videoRef) {
      videoRef.current!.srcObject = null;
    }
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
    }
    // 关闭所有 prosucer
    producersRef.current.forEach((producer, producerId) => {
      producer.close();
      producer.current.delete(producerId);
    });
    liveStreamingStop && liveStreamingStop();
  }

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
          // width: { ideal: 1920 },
          // height: { ideal: 1080 },
          // frameRate: { ideal: 30 }
          width: { ideal: 720 },
          height: { ideal: 1280 },  // 竖屏比例 9:16
          aspectRatio: { ideal: 0.5625 },
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

      if (videoRef) {
        videoRef.current!.srcObject = stream;
      }

      const transport = sendTransportRef.current;

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

      // setIsStreaming(true);
    } catch (error: any) {
      console.error('Error starting stream:', error);
    }
  };


  return {
    videoRef,
    wsInterativeRef,
    transportRef: sendTransportRef
  };
}
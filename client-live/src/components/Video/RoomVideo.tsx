"use client";
import { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters } from 'mediasoup-client/lib/types';

interface RoomVideoProps {
  roomId: string | string[] | undefined;
}

export default function RoomVideo({
  roomId
}: RoomVideoProps) {
  const [connectionInfo, setConnectionInfo] = useState<{
    websocket: string;
    webRTC: string;
  }>({
    websocket: '未连接',
    webRTC: '未连接',
  });
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const transportRef = useRef<any>(null);
  const consumersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`viewer-${Date.now()}`);

  const changeConnectionInfo = (key: 'websocket' | 'webRTC', value: string) => {
    setConnectionInfo((state) => ({
      ...state,
      [key]: value,
    }));
  }

  useEffect(() => {
    const ws = io('http://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });

    wsRef.current = ws;

    const events = {
      'connect': () => {
        changeConnectionInfo('websocket', '已连接');
        setInfo('正在加载媒体设备...');
        ws.emit('getRouterRtpCapabilities', {
          roomId
        });
      },
      'routerRtpCapabilities': async (data: { rtpCapabilities: RtpCapabilities }) => {
        try {
          const device = new Device();
          await device.load({ routerRtpCapabilities: data.rtpCapabilities });
          deviceRef.current = device;
          changeConnectionInfo('webRTC', '设备已加载');
          ws.emit('createTransport', {
            roomId,
            clientId: clientId.current
          });
        } catch (error: any) {
          console.error('设备加载错误:', error);
          setError('加载媒体设备失败');
        }
      },
      'transportIsCreated': async (data: {
        transportOptions: TransportOptions
      }) => {
        try {
          if (!deviceRef.current) {
            throw new Error('Device not initialized');
          }

          const transport = deviceRef.current.createRecvTransport({
            id: data.transportOptions.id,
            iceParameters: data.transportOptions.iceParameters,
            iceCandidates: data.transportOptions.iceCandidates,
            dtlsParameters: data.transportOptions.dtlsParameters,
          });

          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              ws.emit('connectTransport', {
                dtlsParameters,
                transportId: transport.id,
                clientId: clientId.current,
                roomId
              });
              callback();
            } catch (error) {
              errback(error as Error);
            }
          });

          transport.on('connectionstatechange', (state) => {
            switch (state) {
              case 'connecting':
                changeConnectionInfo('webRTC', '正在建立连接...');
                break;
              case 'connected':
                changeConnectionInfo('webRTC', '连接已建立，正在获取媒体流...');
                ws.emit('getProducers', {
                  roomId,
                  clientId: clientId.current
                });
                break;
              case 'failed':
                changeConnectionInfo('webRTC', '连接失败');
                console.error('webrtc连接失败');
                break;
            }
          });

          transportRef.current = transport;

          if (transportRef.current) {
            ws.emit('getProducers', {
              roomId,
              clientId: clientId.current
            });
          }

        } catch (error: any) {
          console.error('创建传输错误:', error);
        }
      },
      'transportConnected': async (data: {
        viewers: number
      }) => {
        setViewers(data.viewers);
        changeConnectionInfo('webRTC', '传输已连接, 等待媒体流...');
      },
      'newProducer': async () => {
        if (transportRef.current) {
          ws.emit('getProducers', {
            roomId,
            clientId: clientId.current
          });
        }
      },
      'producers': async (data: {
        producers: any
      }) => {
        try {
          if (!data.producers || data.producers.length === 0) {
            setInfo('当前没有可用的媒体流');
            return;
          }

          for (const producer of data.producers) {
            if (!deviceRef.current?.rtpCapabilities || !transportRef.current) {
              throw new Error('设备或传输未就绪');
            }
            ws.emit('consume', {
              roomId,
              producerId: producer.id,
              rtpCapabilities: deviceRef.current.rtpCapabilities,
              transportId: transportRef.current.id,
              clientId: clientId.current
            });
          }
        } catch (error: any) {
          console.error('处理生产者错误:', error);
        }
      },
      'consumerCreated': async (data: {
        id: string,
        producerId: string,
        kind: string,
        rtpParameters: RtpParameters
      }) => {
        try {
          const { id, producerId, kind, rtpParameters } = data;

          const consumer = await transportRef.current?.consume({
            id,
            producerId,
            kind,
            rtpParameters,
            paused: false
          });
          changeConnectionInfo('webRTC', '消费者创建成功');
          consumersRef.current.set(id, consumer);

          if (kind === 'video') {
            const stream = new MediaStream([consumer.track]);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              try {
                // await videoRef.current.play();
                setInfo('');
              } catch (error: any) {
                console.error('视频播放错误:', error);
              }
            }
          } else if (kind === 'audio') {
            const stream = videoRef.current?.srcObject as MediaStream;
            if (stream) {
              stream.addTrack(consumer.track);
            } else {
              const newStream = new MediaStream([consumer.track]);
              if (videoRef.current) {
                videoRef.current.srcObject = newStream;
              }
            }
          }

          consumer.on('trackended', () => {
            consumer.close();
            consumersRef.current.delete(id);
            ws.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
          });

          consumer.on('transportclose', () => {
            changeConnectionInfo('webRTC', '消费者传输关闭');
            consumer.close();
            consumersRef.current.delete(id);
            ws.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
          });
        } catch (error: any) {
          console.error('设置消费者错误:', error);
        }
      },
      'livestreamStopped': async () => {
        // 关闭所有 Consumers
        consumersRef.current.forEach((consumer, consumerId) => {
          consumer.close();
          consumersRef.current.delete(consumerId);
        });

        // 清空视频源
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        changeConnectionInfo('webRTC', '连接已关闭');
        setInfo('主播已结束直播');
      },
      'viewerCount': async (data: { viewers: number }) => {
        setViewers(data.viewers);
      },
      'error': async (data: { message: string }) => {
        console.error('服务器错误:', data.message);
      },
      'connect_error': (error: Error) => {
        ws.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
        console.error('WebSocket错误:', error);
      },
      'disconnect': () => {
        ws.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
        console.log('WebSocket已关闭');
        changeConnectionInfo('websocket', '连接已关闭');
      }
    };

    // on events
    Object.entries(events).forEach(([event, handler]) => {
      ws.on(event, handler);
    });

    return () => {
      // off events
      Object.entries(events).forEach(([event, handler]) => {
        ws.off(event, handler);
      });

      consumersRef.current.forEach(consumer => {
        if (consumer) {
          consumer.close();
        }
      });

      if (transportRef.current) {
        transportRef.current.close();
      }

      if (wsRef.current) {
        wsRef.current.close();
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <video
          ref={videoRef}
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
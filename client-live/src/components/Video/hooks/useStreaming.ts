import { RefObject, useEffect, useRef } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import { TransportConnectedSuccess } from '@/types/room.types';
import { useLiveContext } from '@/hooks/useLiveContext';

const useStreaming = ({
  roomId,
  // wsRef,
  videoRef,
  deviceRef
}: {
  roomId: string | string[] | undefined,
  // wsRef: Socket | null,
  videoRef: RefObject<HTMLVideoElement | null>,
  deviceRef: RefObject<Device | null>
}) => {
  const recvTransportRef = useRef<any>(null);
  const consumersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`viewer-${Date.now()}`);
  const { ws: wsRef, isConnected, emit } = useLiveContext();

  useEffect(() => {
    if (!wsRef || !isConnected) return;

    console.log('观看端直播ws服务已经连接: ');
    wsRef?.emit('createRoom', {
      roomId
    });
    const events = {
      'roomCreated': async (data: { routerRtpCapabilities: RtpCapabilities }) => {
        try {
          console.log('观看端加入room 成功');
          const device = new Device();
          await device.load({ routerRtpCapabilities: data.routerRtpCapabilities });
          deviceRef.current = device;
          wsRef?.emit('createTransport', {
            roomId,
            clientId: clientId.current
          });
        } catch (error: any) {
          console.error('设备加载错误:', error);
        }
      },
      'transportIsCreated': async (data: {
        transportOptions: TransportOptions,
        viewerSideType: string,
      }) => {
        try {
          if (!deviceRef.current) {
            throw new Error('Device not initialized');
          }

          if(!deviceRef.current?.loaded) {
            throw new Error('设备还没有加载成功');
          }

          const transport = deviceRef.current!.createRecvTransport({
            id: data.transportOptions.id,
            iceParameters: data.transportOptions.iceParameters,
            iceCandidates: data.transportOptions.iceCandidates,
            dtlsParameters: data.transportOptions.dtlsParameters,
          });

          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log('webrtc成功connect: ');
            try {
              const params: TransportConnectedSuccess = {
                dtlsParameters,
                transportId: transport.id,
                clientId: clientId.current,
                roomId,
              };
              wsRef?.emit('connectTransport', params);
              callback();
            } catch (error) {
              errback(error as Error);
            }
          });

          recvTransportRef.current = transport;

          if (recvTransportRef.current) {
            wsRef?.emit('getProducers', {
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
      }) => {},
      'newProducer': async () => {
        if (recvTransportRef.current) {
          wsRef?.emit('getProducers', {
            roomId,
            clientId: clientId.current
          });
        }
      },
      'producers': async (data: {
        producers: Producer[]
      }) => {
        try {
          if (!data.producers || data.producers.length === 0) {
            return;
          }
          for (const producer of data.producers) {
            if (!deviceRef.current?.rtpCapabilities || !recvTransportRef.current) {
              throw new Error('设备或传输未就绪');
            }
            wsRef?.emit('consume', {
              roomId,
              producerId: producer.id,
              rtpCapabilities: deviceRef.current.rtpCapabilities,
              transportId: recvTransportRef.current.id,
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
          console.log('kind: ', kind);

          const consumer = await recvTransportRef.current?.consume({
            id,
            producerId,
            kind,
            rtpParameters,
            paused: false
          });
          consumersRef.current.set(id, consumer);

          if (kind === 'video') {
            const stream = new MediaStream([consumer.track]);
            if (videoRef) {
              videoRef.current!.srcObject = stream;
              try {
                // await videoRef.current.play();
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
              if (videoRef) {
                videoRef.current!.srcObject = newStream;
              }
            }
          }

          consumer.on('trackended', () => {
            consumer.close();
            consumersRef.current.delete(id);
            wsRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
          });

          consumer.on('transportclose', () => {
            consumer.close();
            consumersRef.current.delete(id);
            wsRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
          });
        } catch (error: any) {
          console.error('设置消费者错误:', error);
        }
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
        wsRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
        console.error('WebSocket错误:', error);
      },
      'disconnect': () => {
        wsRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: clientId.current });
        console.log('WebSocket已关闭');
      }
    };

    // on events
    Object.entries(events).forEach(([event, handler]) => {
      wsRef?.on(event, handler);
    });

    return () => {
      // off events
      Object.entries(events).forEach(([event, handler]) => {
        wsRef?.off(event, handler);
      });

      wsRef && wsRef?.close();

      stopStreaming();
    };
  }, [isConnected]);

  const stopStreaming = () => {
    // 关闭所有 Consumers
    consumersRef.current.forEach((consumer, consumerId) => {
      consumer.close();
      consumersRef.current.delete(consumerId);
    });

    if (recvTransportRef.current) {
      recvTransportRef.current.close();
    }
    // 清空视频源
    if (videoRef) {
      videoRef.current!.srcObject = null;
    }
  }

  return {
    videoRef,
  };
}

export default useStreaming;
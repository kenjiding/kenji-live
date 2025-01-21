import { useEffect, useRef, useState, RefObject } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import { useLiveContext } from '@/hooks/useLiveContext';

export default function useLiveInteractive({
  roomId,
  // deviceRef,
  interactiveVideoRef
}: {
  roomId: string | string[] | undefined,
  // deviceRef: RefObject<Device | null>
  interactiveVideoRef: RefObject<HTMLVideoElement | null>,
}) {
  const { wsInterativeRef, isInteractiveConnected, emit } = useLiveContext();
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const recvTransportRef = useRef<any>(null);
  const consumersRef = useRef<Map<string, any>>(new Map());
  const recvClientId = useRef<string>(`broadcaster-interactive-${Date.now()}`);
  const [interactiveInfo, setInteractive] = useState({userId: ''});
  const deviceRef = useRef<Device | null>(null);

  useEffect(() => {
    if (!wsInterativeRef || !isInteractiveConnected) return;
    console.log('连麦服务已经连接成功');
    wsInterativeRef?.emit('createRoom', {
      roomId
    });
    const events = {
      'roomCreated': async (data: { routerRtpCapabilities: RtpCapabilities }) => {
        try {
          const device = new Device();
          await device.load({ routerRtpCapabilities: data.routerRtpCapabilities });
          deviceRef.current = device;
          wsInterativeRef?.emit('createTransport', {
            roomId,
            clientId: recvClientId.current
          });
        } catch (error: any) {
          console.error('设备加载错误:', error);
        }
      },
      'transportIsCreated': async (data: {
        transportOptions: TransportOptions
      }) => {
        try {
          const transport = deviceRef.current!.createRecvTransport({
            id: data.transportOptions.id,
            iceParameters: data.transportOptions.iceParameters,
            iceCandidates: data.transportOptions.iceCandidates,
            dtlsParameters: data.transportOptions.dtlsParameters,
          });
          console.log('主播端的consumer transport已经创建完成');
          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              console.log('主播端的consumer transport已经连接完成');
              wsInterativeRef?.emit('connectTransport', {
                dtlsParameters,
                transportId: transport.id,
                clientId: recvClientId.current,
                roomId,
              });
              callback();
            } catch (error) {
              errback(error as Error);
            }
          });

          recvTransportRef.current = transport;

          if (recvTransportRef.current) {
            wsInterativeRef?.emit('getProducers', {
              roomId,
              clientId: recvClientId.current
            });
          }
        } catch (error) {
          console.error('Error creating send transport:', error);
          setError('Failed to create media transport');
        }
      },
      'newProducer': async () => {
        if (recvTransportRef.current) {
          wsInterativeRef?.emit('getProducers', {
            roomId,
            clientId: recvClientId.current
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
            if (!deviceRef.current!.rtpCapabilities || !recvTransportRef.current) {
              throw new Error('设备或传输未就绪');
            }
            wsInterativeRef?.emit('consume', {
              roomId,
              producerId: producer.id,
              rtpCapabilities: deviceRef.current!.rtpCapabilities,
              transportId: recvTransportRef.current.id,
              clientId: recvClientId.current
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
            if (interactiveVideoRef) {
              interactiveVideoRef.current!.srcObject = stream;
              try {
                // await videoRef.current.play();
              } catch (error: any) {
                console.error('视频播放错误:', error);
              }
            }
          } else if (kind === 'audio') {
            const stream = interactiveVideoRef.current?.srcObject as MediaStream;
            if (stream) {
              stream.addTrack(consumer.track);
            } else {
              const newStream = new MediaStream([consumer.track]);
              if (interactiveVideoRef) {
                interactiveVideoRef.current!.srcObject = newStream;
              }
            }
          }

          consumer.on('trackended', () => {
            consumer.close();
            consumersRef.current.delete(id);
            wsInterativeRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: recvClientId.current });
          });

          consumer.on('transportclose', () => {
            consumer.close();
            consumersRef.current.delete(id);
            wsInterativeRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: recvClientId.current });
          });
        } catch (error: any) {
          console.error('设置消费者错误:', error);
        }
      },
      'clientRequestInteractive': async (data: {roomId: string, userId: string}) => {
        console.log('观众请求连麦data: ', data);
        setInteractive(data);
      },
      'livestreamStopped': async () => {
        stopStreaming();
      },
      'transportConnected': async (data: { viewers: number }) => {
        setViewers(data.viewers);
        console.log('Transport connected successfully');
      },
      'producerCreated': async (data: {
        producerId: string,
      }) => {},
      'error': async (data: {
        message: string
      }) => {
        console.error('Server error:', data.message);
        setError(data.message);
      },
      'disconnect': () => {
        console.log('WebSocket disconnected');
        setError('Connection closed');
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
      stopStreaming();
      wsInterativeRef?.disconnect();
    };
  }, [isInteractiveConnected]);

  const stopStreaming = () => {
    // 关闭所有 Consumers
    consumersRef.current.forEach((consumer, consumerId) => {
      consumer.close();
      consumersRef.current.delete(consumerId);
    });

    if (recvTransportRef.current) {
      recvTransportRef.current.close();
    }
  }

  return {
    interactiveInfo,
  };
}
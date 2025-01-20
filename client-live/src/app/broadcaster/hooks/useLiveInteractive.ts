import { useEffect, useRef, useState, RefObject } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import { useLiveContext } from '@/hooks/useLiveContext';

export default function useLiveInteractive({
  roomId,
  deviceRef,
  interactiveVideoRef
}: {
  roomId: string | string[] | undefined,
  deviceRef: RefObject<Device | null>
  interactiveVideoRef: RefObject<HTMLVideoElement | null>,
}) {
  const { ws: wsRef, isConnected, emit } = useLiveContext();
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const recvTransportRef = useRef<any>(null);
  const consumersRef = useRef<Map<string, any>>(new Map());
  const recvClientId = useRef<string>(`broadcaster-interactive-${Date.now()}`);
  const [interactiveInfo, setInteractive] = useState({userId: ''});

  useEffect(() => {
    if (!wsRef || !isConnected) return;

    const events = {
      'clientRequestInteractive': async (data: {roomId: string, userId: string}) => {
        console.log('观众请求连麦data: ', data);
        setInteractive(data);
      },
      'transportIsCreated': async (data: {
        transportOptions: TransportOptions
      }) => {
        try {
          if(!deviceRef) return;
          const transport = deviceRef.current!.createRecvTransport({
            id: data.transportOptions.id,
            iceParameters: data.transportOptions.iceParameters,
            iceCandidates: data.transportOptions.iceCandidates,
            dtlsParameters: data.transportOptions.dtlsParameters,
          });

          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              wsRef?.emit('connectTransport', {
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
            wsRef?.emit('getProducers', {
              roomId,
              clientId: recvClientId.current
            });
          }
        } catch (error) {
          console.error('Error creating send transport:', error);
          setError('Failed to create media transport');
        }
      },
      // 这里订阅的是观看端的音频流
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
            wsRef?.emit('consume', {
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
            wsRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: recvClientId.current });
          });

          consumer.on('transportclose', () => {
            consumer.close();
            consumersRef.current.delete(id);
            wsRef?.emit('removeViewer', { type: 'removeViewer', roomId, clientId: recvClientId.current });
          });
        } catch (error: any) {
          console.error('设置消费者错误:', error);
        }
      },
      'newProducer': async () => {
        if (recvTransportRef.current) {
          wsRef?.emit('getProducers', {
            roomId,
            clientId: recvClientId.current
          });
        }
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
      }) => {
        // producersRef.current.set(data.producerId, data);
      },
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
      wsRef?.on(event, handler);
    });

    return () => {
      // off events
      Object.entries(events).forEach(([event, handler]) => {
        wsRef?.off(event, handler);
      });
      stopStreaming();
      wsRef?.disconnect();
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
  }

  return {
    wsRef,
    interactiveInfo,
  };
}
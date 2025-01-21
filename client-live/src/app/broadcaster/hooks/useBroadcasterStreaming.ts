import { useEffect, useRef, useState, RefObject } from 'react';
import { Device } from 'mediasoup-client';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { RtpCapabilities, TransportOptions, RtpParameters, Producer, Transport } from 'mediasoup-client/lib/types';
import { useLiveContext } from '@/hooks/useLiveContext';

export default function useBroadcasterStreaming({
  roomId,
  deviceRef,
}: {
  roomId: string | string[] | undefined,
  deviceRef: RefObject<Device | null>,
}) {
  const { ws: wsRef, isConnected, emit } = useLiveContext();
  const [viewers, setViewers] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const transportRef = useRef<any>(null);
  const producersRef = useRef<Map<string, any>>(new Map());
  const clientId = useRef<string>(`broadcaster-${Date.now()}`);

  useEffect(() => {
    if (!wsRef || !isConnected) return;
    console.log('主播端 直播服务 WebSocket connected');
    wsRef?.emit('createRoom', {roomId});
    const events = {
      'roomCreated': async (data: { routerRtpCapabilities: RtpCapabilities }) => {
        if (!data.routerRtpCapabilities) {
          console.error('No router RTP capabilities received');
          return;
        }
        console.log('主播加入直播房间成功, roomCreated');

        try {
          // 创建了一个新的媒体设备实例
          const device = new Device();
          await device.load({ routerRtpCapabilities: data.routerRtpCapabilities });
          deviceRef.current = device;
          console.log('主播直播 device 已经准备就绪: ');
          wsRef?.emit('createTransport', {
            roomId,
            clientId: clientId.current,
          });
        } catch (error) {
          console.error('Error loading device:', error);
          setError('Failed to load media device');
        }
      },
      'transportIsCreated': async (data: {
        transportOptions: TransportOptions
      }) => {
        try {
          const transport = deviceRef.current!.createSendTransport({
            id: data.transportOptions.id,
            iceParameters: data.transportOptions.iceParameters,
            iceCandidates: data.transportOptions.iceCandidates,
            dtlsParameters: data.transportOptions.dtlsParameters,
          });
          transportRef.current = transport;
          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log('主播直播 transport 已经连接完成');
            try {
              wsRef?.emit('connectTransport', {
                dtlsParameters,
                transportId: transport.id,
                clientId: clientId.current,
                roomId,
              });
              callback();
            } catch (error) {
              errback(error as Error);
            }
          });

          transport.on('produce', async (parameters: any, callback, errback) => {
            try {
              wsRef?.emit('produce', {
                type: 'produce',
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                transportId: transport.id,
                clientId: clientId.current,
                roomId
              });

              // 等待服务器返回 producerId，不然无法完成 Producer 创建的最后一步
              const onProducerCreated = (res: any) => {
                wsRef?.off('producerCreated', onProducerCreated);
                callback({ id: res.producerId });
              };

              wsRef?.on('producerCreated', onProducerCreated);
            } catch (error) {
              errback(error as Error);
            }
          });
        } catch (error) {
          console.error('Error creating send transport:', error);
          setError('Failed to create media transport');
        }
      },
      'transportConnected': async (data: { viewers: number }) => {
        setViewers(data.viewers);
      },
      'producerCreated': async (data: {
        producerId: string,
      }) => {
        producersRef.current.set(data.producerId, data);
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
      producersRef.current.forEach(producer => {
        if (producer) {
          producer.close();
        }
      });
      if (transportRef.current) {
        transportRef.current.close();
      }
      wsRef?.disconnect();
    };
  }, [isConnected]);

  return {
    transportRef: transportRef,
    wsRef,
    streamRef,
    producersRef: producersRef,
  };
}
import { RtpCapabilities, TransportOptions, DtlsParameters } from 'mediasoup-client/lib/types';

export interface TransportConnectedSuccess {
  dtlsParameters: DtlsParameters,
  transportId: string,
  clientId:string,
  roomId: string | string[] | undefined,
}
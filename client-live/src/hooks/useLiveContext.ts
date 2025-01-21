import { useContext } from 'react';
import { LiveContext } from '../contexts/LiveContext';

export function useLiveContext() {
  const context = useContext(LiveContext);
  
  if (!context) {
    throw new Error('useLiveContext must be used within LiveProvider');
  }

  const { ws, isConnected, roomId, wsInterativeRef, isInteractiveConnected } = context;

  // 提供一些辅助方法
  const emit = (event: string, data: any) => {
    if (!ws || !isConnected) {
      console.warn('WebSocket is not connected');
      return;
    }
    ws.emit(event, data);
  };

  return {
    ws,
    isConnected,
    isInteractiveConnected,
    roomId,
    emit,
    wsInterativeRef
  };
}
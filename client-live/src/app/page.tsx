"use client"
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import LiveMain from '@/components/LiveMain';

export default function Home() {
  const [roomId, setRoomId] = useState<string>('');
  
  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(7);
    setRoomId(newRoomId);
  };

  return (
    <main className="flex flex-col h-screen">
      <Header></Header>
      <div className='flex flex-1 overflow-hidden'>
        <LiveMain></LiveMain>
      </div>
    </main>
  );
}
import React, { useRef } from 'react';
import LeftSideBar from './LeftSideBar';
import RightSideBar from './RightSideBar';
import Content from './Content';
import { LiveProvider } from '@/contexts/LiveContext';

const LiveMain = () => {
  return (
    <div className="flex h-screen w-full">
      <LeftSideBar></LeftSideBar>
      <LiveProvider roomId="123456" url='http://192.168.1.105:3001/live/streaming'>
        <Content></Content>
      </LiveProvider>
      <RightSideBar></RightSideBar>
    </div>
  );
};

export default LiveMain;
import React from 'react';
import { useParams } from 'next/navigation';
import RoomVideo from '../Video/RoomVideo';
import Image from 'next/image';
import { Heart, Users, Forward, Ellipsis, CirclePlus } from 'lucide-react';
import RecommendLives from './RecommendLives';
import GivePresent from './GivePresent';

const SideBar = () => {
  const { roomId } = useParams();

  return (
    <main className="flex-1 min-w-0 overflow-auto">
      <div className='bg-[#121212] flex px-4 py-2 justify-between'>
        <div className='flex w-full'>
          <div className='w-10 flex justify-center items-center mr-2 rounded-full border border-pink-700'>
            <Image
              alt='gift'
              width={30}
              height={30}
              className="object-contain rounded-full"
              src="https://p16-sign-sg.tiktokcdn.com/aweme/720x720/tos-alisg-avt-0068/5e9ea2169875479736ec43b059074ad7.webp?lk3s=a5d48078&nonce=48711&refresh_token=5ffa0685dc1130b6f0f4447dd0c9b8f5&x-expires=1737291600&x-signature=0Kjo8jnar8DaZWTDZ4jImKJuQfs%3D&shp=a5d48078&shcp=fdd36af4"
            />
          </div>
          <div className='text-sm flex-1'>
            <p className='text-lg'>KenGm</p>
            <div className='text-gray-300 truncate overflow-hidden text-ellipsis text-sm flex mt-1'>
              <div className='flex'>
                <Heart size={18} />12
              </div>
              <div className='flex mx-3'>
                <Users size={18} />34
              </div>
            </div>
          </div>
        </div>
        <div className='flex justify-center items-center px-2'>
          <div className='w-8 h-8 flex justify-center items-center bg-gray-800 rounded-lg cursor-pointer'>
            <Forward />
          </div>
          <div className='w-8 h-8 flex justify-center items-center bg-gray-800 rounded-lg mx-2 cursor-pointer'>
            <Ellipsis />
          </div>
          <div className='flex rounded-sm bg-red-500 py-1 px-3'>
            <p className='w-10'>关注</p>
            <CirclePlus />
          </div>
        </div>
      </div>
      <div className='p-4'>
        <div className="px-3 rounded-lg shadow w-full">
          <RoomVideo roomId={'123456'}></RoomVideo>
        </div>
        <GivePresent></GivePresent>
        <div className='py-10 text-xl'>
          <RecommendLives></RecommendLives>
        </div>
      </div>
    </main>
  );
};

export default SideBar;
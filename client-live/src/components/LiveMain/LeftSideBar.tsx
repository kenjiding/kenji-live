import React from 'react';
import { Camera, House, UserRoundCheck, Handshake, TvMinimalPlay, RefreshCcw } from 'lucide-react';
import { recommendList } from '@/mockData';
import Image from 'next/image';

const LeftSideBar = (props: {
  className?: string;
}) => {
  return (
    <aside className={`w-60 shadow-lg bg-[#121212] border-r border-gray-800 overflow-y-auto ${props.className}`}>
      <div className="p-4">
        <nav>
          <ul className="space-y-1">
            <li>
              <a href="#" className="flex items-center p-2 hover:bg-gray-900 rounded text-xl">
                <House className="mr-2" />
                <span>Home</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center p-2 hover:bg-gray-900 rounded text-xl">
                <Camera className="mr-2" />
                <span>recommend</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center p-2 hover:bg-gray-900 rounded text-xl">
                <UserRoundCheck className="mr-2" />
                <span>follows</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center p-2 hover:bg-gray-900 rounded text-xl">
                <Handshake className="mr-2" />
                <span>friends</span>
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center p-2 hover:bg-gray-900 rounded text-xl">
                <TvMinimalPlay className="mr-2" />
                <span>live</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className='border-t border-gray-800'>
        <div className='flex items-center px-3'>
          <span className='text-sm py-3 font-bold flex-1'>Recommended Lives</span>
          <RefreshCcw size={19} className=' cursor-pointer' />
        </div>
        <ul>
          {
            recommendList.map((item, index) => (
              <li key={index} className='flex pr-3'>
                <div className='flex w-full py-2 px-3'>
                  <div className='w-10 flex justify-center items-center mr-2 rounded-full border border-pink-700'>
                    <Image
                      alt='gift'
                      width={30}
                      height={30}
                      className="object-contain rounded-full"
                      src={item.src}
                    />
                  </div>
                  <div className='text-sm flex-1'>
                    <p className='text-md'>{item.name}</p>
                    <p className='text-gray-500 truncate overflow-hidden text-ellipsis'>{item.profile}</p>
                  </div>
                </div>
                <span className='flex items-center'>{item.viewer}</span>
              </li>
            ))
          }
        </ul>
      </div>
    </aside>
  );
};

export default LeftSideBar;
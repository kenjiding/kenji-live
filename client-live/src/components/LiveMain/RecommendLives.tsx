import React from 'react';
import Image from 'next/image';
import { recommendList } from '@/mockData';

type RecommendLivesProps = {
  // props
};

const RecommendLives: React.FC<RecommendLivesProps> = (props) => {
  return (
    <div>
      <h2 className='pb-7'>Recommended Lives</h2>
      <div className='grid grid-cols-4 gap-4 place-items-center'>
        {recommendList.map((item, index) => (
            <div
              className='w-full h-full flex flex-col items-center justify-center relative cursor-pointer'
              key={index}
            >
              {/* <div className='absolute inset-0 bg-white/20 backdrop-blur-md rounded-lg'></div> */}
              <div className='relative inset-0 bg-white/20 backdrop-blur-md w-full h-full flex justify-center'>
                <Image
                  alt='gift'
                  width={150}
                  height={150}
                  className="object-contain"
                  src={item.src}
                />
                <div className='absolute bottom-1 left-0 w-full flex justify-between text-sm px-1 pb-1 z-20'>
                  <span className='bg-slate-900 opacity-70 px-2 rounded-sm'>{item.viewer}名观众</span>
                  <span className='bg-[#ff1764] px-2 rounded-sm'>LIVE</span>
                </div>
              </div>
              <div className='flex w-full py-3 px-3'>
                <div className='w-10 h-auto'>
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
                  <p className='text-gray-500'>{item.profile}</p>
                </div>
              </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default RecommendLives;
import React from 'react';
import Image from 'next/image';
import { CircleDollarSign } from 'lucide-react';
import Flower from '../../assets/images/gift-flower.webp';
import Aixin from '../../assets/images/gift-aixin.webp';
import Mon from '../../assets/images/gift-mon.webp';
import Qie from '../../assets/images/gift-qie.webp';
import Xin from '../../assets/images/gift-xin.webp';

const gifts = [
  {
    image: Flower,
    name: 'flower',
    cost: 12,
  },
  {
    image: Aixin,
    name: 'xin',
    cost: 5,
  },
  {
    image: Mon,
    name: 'mon',
    cost: 8,
  },
  {
    image: Qie,
    name: 'flower',
    cost: 19,
  },
  {
    image: Xin,
    name: 'flower',
    cost: 40,
  },
  {
    image: Flower,
    name: 'flower',
    cost: 23,
  },
];

type GivePresentProps = {
  // props
};

const GivePresent: React.FC<GivePresentProps> = (props) => {
  return (
    <div className='bg-[#1e1e1e] px-8 rounded-xl'>
      <ul className='flex border-b border-gray-600'>
        {
          gifts.map((item, index) => (
            <li className={`flex-1 py-3 mx-3 flex flex-col items-center justify-center cursor-pointer
            hover:scale-110 transition-transform duration-300 
            hover:shadow-lg rounded-lg
            hover:bg-gray-800`} key={index}>
              <Image alt='gift' width={45} height={45} src={item.image}></Image>
              <p className='text-gray-400 text-sm text-center my-2'>{item.name}</p>
              <p className='flex text-sm'>
                <CircleDollarSign className='text-yellow-600 mr-1' size={20}></CircleDollarSign>
                <b>${item.cost}</b>
              </p>
            </li>
          ))
        }
      </ul>
      <div className='flex p-3 items-center'>
        <span className='mr-3'>余额: </span>
        <CircleDollarSign className='text-yellow-600 mr-1' size={20}></CircleDollarSign>
        0
        <span className='cursor-pointer border border-red-600 text-red-600 py-1 px-3 text-sm ml-5'>获取金币</span>
      </div>
    </div>
  );
};

export default GivePresent;
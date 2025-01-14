

import { getMediaCodecsRouters } from '../web-rtc/index.js';
import redisIns from '../redis.js';
const {redis} = redisIns;

export const getOrCreateRouter = async (roomId, rooms) => {
  let router = rooms.get(roomId);
  if (!router) {
    router = await getMediaCodecsRouters();
    rooms.set(roomId, router);
    console.log('Created new router for room:', roomId);
  }
  return router;
};

export async function addViewer(roomId, viewerId) {
  await redis.sadd(`room:${roomId}:viewers`, viewerId);
  await redis.hincrby(`room:${roomId}:stats`, 'viewerCount', 1);
}

export async function removeViewer(roomId, viewerId) {
  await redis.srem(`room:${roomId}:viewers`, viewerId);
  await redis.hincrby(`room:${roomId}:stats`, 'viewerCount', -1);
}

export async function getViewerCount(roomId) {
  const viewerCount = await redis.scard(`room:${roomId}:viewers`);
  return viewerCount;
}

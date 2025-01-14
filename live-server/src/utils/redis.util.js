import redisIns from '../redis.js';

const redis = redisIns.redis;

export async function gracefulShutdown() {
  try {
    // 1. 获取所有活跃房间
    const rooms = await redis.keys('room:*:viewers');
    
    // 2. 批量删除相关数据
    if (rooms.length > 0) {
      const pipeline = redis.pipeline();
      rooms.forEach(roomKey => {
        // 删除观众集合
        pipeline.del(roomKey);
        // 删除统计数据
        const statsKey = roomKey.replace(':viewers', ':stats');
        pipeline.del(statsKey);
      });
      await pipeline.exec();
    }
    
    // 3. 关闭 Redis 连接
    await redis.quit();
    
    console.log('成功清理 Redis 数据');
  } catch (error) {
    console.error('清理 Redis 数据失败:', error);
  }
}
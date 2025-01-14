import Redis from 'ioredis';

class RedisService {
  constructor() {
    this.redis = new Redis({
      port: process.env.REDIS_PORT || 6379,
      host: process.env.REDIS_HOST || '127.0.0.1',
      password: process.env.REDIS_PASSWORD || '123456',
      db: process.env.REDIS_DB || 0,
      connectTimeout: 5000,  // 连接超时 5 秒
      maxRetriesPerRequest: 3, // 每个请求最大重试次数
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    // 连接错误监听
    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  // 通用方法
  async set(key, value, expire = 3600) {
    return this.redis.set(key, JSON.stringify(value), 'EX', expire);
  }

  async get(key) {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
}

export default new RedisService();
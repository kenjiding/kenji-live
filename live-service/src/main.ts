import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type'],
    credentials: true,
  });

  await app.listen(3001, () => {
    console.log('HTTP服务器运行在: http://localhost:3001');
    console.log('WebSocket服务器运行在: ws://localhost:3002');
  });
}

bootstrap();

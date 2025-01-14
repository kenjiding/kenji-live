import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

import express from 'express';
import http from 'http';
import cors from 'cors';
import { createWorker } from './web-rtc/index.js';
import { wsInit } from './ws/index.js';
import {gracefulShutdown} from './utils/redis.util.js';

const app = express();
const server = http.createServer(app);

// websocket server init
wsInit({ server });

app.use(cors());
app.use(express.json());

const start = async () => {
  // start web-rtc worker
  await createWorker();

  const port = 3001;
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);
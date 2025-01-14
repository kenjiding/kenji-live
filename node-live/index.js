// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 存储房间信息
const rooms = new Map();
let roomConnections = {};  // 房间连接状态

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 创建或加入房间
  socket.on('join-room', (roomId, userId) => {
    console.log('join-room: ', roomId, userId);
    socket.join(roomId);
    roomConnections[userId] = {
      answer: false,
      offer: false,
    };
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { broadcaster: userId, viewers: new Set() });
    } else if (userId !== rooms.get(roomId).broadcaster) {
      rooms.get(roomId).viewers.add(userId);
    }
    
    socket.roomId = roomId;
    socket.userId = userId;
    
    // 通知房间内其他用户
    socket.to(roomId).emit('user-connected', userId);
  });

  // 处理offer
  socket.on('broadcast-offer', (offer, roomId) => {
    console.log('broadcast-offer-------9090>: ', roomId);
    if(roomConnections[userId].offer) {
      return;
    }
    roomConnections[userId].offer = true;
    socket.to(roomId).emit('receive-offer', offer);
  });

  // 处理answer
  socket.on('send-answer', ({ answer, roomId, userId }) => {
    console.log('answer, roomId, userId:------->', userId);

    if(roomConnections[userId].answer) {
      return;
    }
    roomConnections[userId].answer = true;
    socket.to(roomId).emit('receive-answer', {
      answer,
      userId
    });
  });

  // 处理ICE candidate
  socket.on('ice-candidate', (candidate, roomId) => {
    console.log('ice-candidate触发: ', roomId, '并且发送了 receive-ice-candidate');
    socket.to(roomId).emit('receive-ice-candidate', candidate);
  });

  // 处理断开连接
  socket.on('disconnect', () => {
    if (socket.roomId && socket.userId) {
      const roomInfo = rooms.get(socket.roomId);
      if (roomInfo) {
        if (roomInfo.broadcaster === socket.userId) {
          // 如果是主播断开，清除房间信息
          rooms.delete(socket.roomId);
          io.to(socket.roomId).emit('broadcaster-left');
        } else {
          // 如果是观众断开，从观众列表中移除
          roomInfo.viewers.delete(socket.userId);
        }
      }
    }
    console.log('用户断开连接:', socket.id);
  });
});

const PORT = process.env.PORT || 7001;
server.listen(PORT, () => {
  console.log(`信令服务器运行在端口 ${PORT}`);
});
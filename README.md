
# 🛰️ WebRTC Live Streaming Platform

A real-time live streaming platform like TikTok built with **NestJS**, **Next.js**, **WebRTC**, and **mediasoup**. This project includes both the frontend and backend for a complete low-latency broadcasting system.

## start live
![Live Demo](./client-live/public/start-live.gif)

## Request to join
![Request to join](./client-live/public/join-room.gif)


## 📦 Monorepo Structure

.
├── client-live/     # Frontend built with Next.js

└── live-service/    # Backend built with NestJS and mediasoup

## 🚀 Features

- 🎥 Real-time audio/video broadcasting with WebRTC
- ⚙️ mediasoup-powered SFU for scalable stream distribution
- 🌐 Frontend built with modern Next.js (React, SSR support)
- 🧱 Backend with NestJS: modular, testable, and robust
- 🔐 Basic media security features like echo cancellation, noise suppression
- 📡 Socket-based signaling layer


## 📁 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/kenjiding/kenji-live.git
cd kenji-live
```

### 2. Start Backend (NestJS + mediasoup)

```bash
cd live-service
npm install
npm run start:dev
```

### 3. Start Frontend (Next.js client)

```bash
cd client-live
npm install
npm run dev
```

Then open: [http://localhost:4000](http://localhost:4000), and click right-top corner "start broadcasting" to start Live
---

## 🛠️ Tech Stack

| Layer     | Technology    |
|-----------|---------------|
| Frontend  | Next.js, React |
| Backend   | NestJS, mediasoup |
| Signaling | WebSocket (socket.io or native WS) |
| Media     | WebRTC |
| Language  | TypeScript |

---

## 🧪 Development Notes

- Mediasoup requires proper `worker` config and may need access to UDP/TCP ports.
- HTTPS or localhost is required for WebRTC APIs to work.
- Ideal for LAN testing or self-hosted streaming.

---

## 📷 Screenshots

> _Add screenshots or GIFs showing the live streaming interface and connection process._

---

## 📜 License

MIT

---

## 🙌 Acknowledgements

- [mediasoup](https://mediasoup.org/)
- [NestJS](https://nestjs.com/)
- [Next.js](https://nextjs.org/)
- WebRTC community and MDN docs

```
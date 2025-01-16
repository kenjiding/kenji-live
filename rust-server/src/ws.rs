use anyhow::Result;
use axum::{
    extract::{
        State, 
        WebSocketUpgrade, 
        ws::{WebSocket, Message}
    },
    routing::{get, post},
    Router as AxumRouter,
    response::Response,
    handler::Handler,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Serialize, Deserialize};
use tokio::sync::{mpsc, Mutex};
use std::sync::Arc;
use uuid::Uuid;

use crate::config::AppConfig;
use crate::server::media_router::MediaRouter;
use crate::utils::error::AppError;

// 信令服务器状态
pub struct SignalingServerState {
    // 活跃的WebSocket连接
    connections: Mutex<Vec<Uuid>>,
    // 房间管理
    rooms: Mutex<HashMap<Uuid, Room>>,
    media_router: Arc<MediaRouter>,
    config: AppConfig,
}

// 房间数据结构
#[derive(Debug, Clone)]
pub struct Room {
    id: Uuid,
    name: String,
    creator_id: Uuid,
    participants: Vec<Uuid>,
    stream_key: Option<String>,
}

// 信令消息定义
#[derive(Debug, Serialize, Deserialize)]
pub enum SignalingMessage {
    // 连接管理
    Connect { 
        user_id: Option<Uuid>,
        username: String 
    },
    Connected { 
        user_id: Uuid 
    },
    Disconnected { 
        user_id: Uuid 
    },
    
    // 房间操作
    CreateRoom { 
        room_name: String 
    },
    JoinRoom { 
        room_id: Uuid 
    },
    LeaveRoom { 
        room_id: Uuid 
    },
    
    // 直播流控制
    StartStream { 
        room_id: Uuid, 
        stream_key: String 
    },
    StopStream { 
        room_id: Uuid 
    },
    
    // WebRTC信令交换
    Offer { 
        room_id: Uuid, 
        sender_id: Uuid,
        receiver_id: Uuid,
        sdp: String 
    },
    Answer { 
        room_id: Uuid, 
        sender_id: Uuid,
        receiver_id: Uuid,
        sdp: String 
    },
    IceCandidate { 
        room_id: Uuid, 
        sender_id: Uuid,
        receiver_id: Uuid,
        candidate: String 
    },
    
    // 错误处理
    Error { 
        code: ErrorCode, 
        message: String 
    },
}

// 错误码枚举
#[derive(Debug, Serialize, Deserialize)]
pub enum ErrorCode {
    Unauthorized,
    RoomNotFound,
    StreamingError,
    ConnectionError,
}

impl SignalingServer {
    pub fn new(
        media_router: Arc<MediaRouter>, 
        config: &AppConfig
    ) -> Arc<Self> {
        Arc::new(Self {
            connections: Mutex::new(Vec::new()),
            rooms: Mutex::new(HashMap::new()),
            media_router,
            config: config.clone(),
        })
    }

    // 创建Web服务路由
    pub fn create_routes(&self) -> AxumRouter {
        AxumRouter::new()
            .route("/ws", get(self.websocket_handler))
            .route("/room", post(self.create_room))
            .with_state(Arc::clone(&self))
    }

    // WebSocket连接处理
    async fn websocket_handler(
        State(state): State<Arc<Self>>, 
        ws: WebSocketUpgrade
    ) -> Response {
        ws.on_upgrade(|socket| async move {
            Self::handle_websocket_connection(state, socket).await
        })
    }

    // WebSocket连接处理逻辑
    async fn handle_websocket_connection(
        state: Arc<Self>, 
        mut socket: WebSocket
    ) {
        // 生成唯一用户ID
        let user_id = Uuid::new_v4();

        // 添加连接
        {
            let mut connections = state.connections.lock().await;
            connections.push(user_id);
        }

        // 消息处理循环
        while let Some(Ok(message)) = socket.next().await {
            match message {
                Message::Text(text) => {
                    // 解析信令消息
                    match serde_json::from_str::<SignalingMessage>(&text) {
                        Ok(signaling_msg) => {
                            Self::process_signaling_message(
                                &state, 
                                user_id, 
                                signaling_msg
                            ).await;
                        },
                        Err(e) => {
                            tracing::error!("消息解析错误: {}", e);
                        }
                    }
                },
                Message::Close(_) => break,
                _ => {}
            }
        }

        // 清理连接
        {
            let mut connections = state.connections.lock().await;
            connections.retain(|&id| id != user_id);
        }
    }

    // 处理信令消息
    async fn process_signaling_message(
        state: &Arc<Self>, 
        user_id: Uuid, 
        message: SignalingMessage
    ) {
        match message {
            SignalingMessage::CreateRoom { room_name } => {
                Self::create_room_handler(state, user_id, room_name).await;
            },
            SignalingMessage::JoinRoom { room_id } => {
                Self::join_room_handler(state, user_id, room_id).await;
            },
            SignalingMessage::StartStream { room_id, stream_key } => {
                Self::start_stream_handler(state, user_id, room_id, stream_key).await;
            },
            // 处理其他信令消息类型
            _ => {}
        }
    }

    // 创建房间处理器
    async fn create_room_handler(
        state: &Arc<Self>, 
        user_id: Uuid, 
        room_name: String
    ) {
        let room_id = Uuid::new_v4();
        let new_room = Room {
            id: room_id,
            name: room_name,
            creator_id: user_id,
            participants: vec![user_id],
            stream_key: None,
        };

        let mut rooms = state.rooms.lock().await;
        rooms.insert(room_id, new_room);
    }

    // 加入房间处理器
    async fn join_room_handler(
        state: &Arc<Self>, 
        user_id: Uuid, 
        room_id: Uuid
    ) {
        let mut rooms = state.rooms.lock().await;
        if let Some(room) = rooms.get_mut(&room_id) {
            room.participants.push(user_id);
        }
    }

    // 开始直播流处理器
    async fn start_stream_handler(
        state: &Arc<Self>, 
        user_id: Uuid, 
        room_id: Uuid,
        stream_key: String
    ) {
        let mut rooms = state.rooms.lock().await;
        if let Some(room) = rooms.get_mut(&room_id) {
            // 确保只有房间创建者可以开始直播
            if room.creator_id == user_id {
                room.stream_key = Some(stream_key);
            }
        }
    }

    // 启动信令服务
    pub async fn start(&self) -> Result<()> {
        tracing::info!(
            "信令服务器启动，监听地址: {}:{}",
            self.config.server.host,
            self.config.server.port
        );
        Ok(())
    }
}

// 错误处理trait实现
impl From<SignalingServerError> for AppError {
    fn from(err: SignalingServerError) -> Self {
        match err {
            SignalingServerError::RoomNotFound => 
                AppError::NotFound("房间不存在".to_string()),
            SignalingServerError::Unauthorized => 
                AppError::Unauthorized("未授权的操作".to_string()),
            _ => AppError::InternalServerError,
        }
    }
}

// 专用错误类型
#[derive(Debug, thiserror::Error)]
pub enum SignalingServerError {
    #[error("房间未找到")]
    RoomNotFound,
    
    #[error("未授权")]
    Unauthorized,
    
    #[error("连接错误")]
    ConnectionError,
    
    #[error("流媒体错误")]
    StreamingError,
}
use anyhow::Result;
use futures::{SinkExt, StreamExt};
use serde_json::{json, ser};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct WebSocketData {
  r#type: String,
  data: String,
}

struct WebsocketConfigs {
  url: String,
}

struct AppConfig {
  websocket: WebsocketConfigs
}

pub enum SignalWebsocetMessage {
  CreateRoom {
    room_id: Uuid
  },
  CreateTransport {
    room_id: Uuid,
    client_id: Uuid,
  }
}

pub struct WebsocketServer {
  pub media_router: Arc<MediaRouter>
}

impl WebsocketServer {
  pub async fn new(app_config: AppConfig) {
    const URL: &str = "localhost:8080";
    let listener = TcpListener::bind(URL).await?;
    println!("ws server is listening on: {}", URL);

    while let Ok((stream, _)) = listener.accept().await {
      tokio::spawn(async move {
        let tcp_connection = tokio_tungstenite::accept_async(stream).await;
        match tcp_connection {
          Ok(mut websokcet) => {
            println!("New WebSocket connection: {}", 1);
            while let Some(message) = websokcet.next().await {
              match message {
                Ok(_msg) => {
                  match _msg {
                    Message::Text(text) => {
                      // 处理文本消息
                      println!("Received a message: {}", text);
                      let ws_data = WebSocketData {
                        r#type: "收到了你的发送的数据".to_string(),
                        data: text,
                      };

                      if let Ok(data_str) = serde_json::to_string(&ws_data) {
                        websokcet.send(Message::Text(data_str)).await.unwrap();
                      }
                      
                    },
                    Message::Ping(ping) => {
                      if let Err(e) = websokcet.send(Message::Pong(ping)).await {
                        eprintln!("WebSocket错误: {}", e);
                        break;
                      }
                        // 处理Ping消息
                    },
                    Message::Close(_) => {
                        println!("WebSocket关闭");
                        // 处理关闭消息
                        break;
                    },
                    _ => {},
                  }
                },
                Err(e) => {
                  eprintln!("WebSocket错误: {}", e);
                  break;
                }
              }

            }
          },
          Err(e) => {
            eprintln!("WebSocket错误: {}", e);
          },
        }

      });
    }
  }
}


use rust_server::WebsocketServer;
use anyhow::Result;
use tokio;

#[tokio::main]
async fn main() -> Result<()> {
    let app_config = AppConfig {
        websocket: WebsocketConfigs {
            url: "localhost:8080".to_string()
        }
    };
    
    // let media_router = MediaRouter::new(); // 需要根据你的 MediaRouter 实现来创建
    let websocket_server = WebsocketServer::new(app_config).await;
    
    // 保持程序运行
    tokio::signal::ctrl_c().await.unwrap();
    println!("Shutting down");
    Ok(())
}
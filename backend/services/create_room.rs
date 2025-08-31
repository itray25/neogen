use actix::prelude::*;
use actix_web::{web, HttpResponse, Result, post};
use serde::{Deserialize, Serialize};
use rand::Rng;
use crate::services::ws::{GameServer, CreateRoom};

/// 生成房间ID（不超过10位字符串）
pub fn generate_room_id() -> String {
    let mut rng = rand::rng();
    let room_id: u32 = rng.random_range(100000..=9999999); // 6-7位数字
    room_id.to_string()
}

/// 验证自定义房间ID格式
fn validate_room_id(room_id: &str) -> Result<(), String> {
    // 检查长度
    if room_id.is_empty() {
        return Err("房间ID不能为空".to_string());
    }
    
    if room_id.len() > 10 {
        return Err("房间ID不能超过10个字符".to_string());
    }
    
    // 检查字符：只允许中文、英文字母、数字
    for ch in room_id.chars() {
        if !ch.is_ascii_alphanumeric() && !ch.is_alphabetic() {
            return Err("房间ID只能包含中文、英文字母和数字".to_string());
        }
    }
    
    Ok(())
}

#[derive(Deserialize)]
pub struct CreateRoomRequest {
    pub room_id: Option<String>, // 可选的自定义房间ID
    pub name: String,
    pub max_players: usize,
    pub room_color: String, // 房间专属颜色，例如 "#FF5733"
    pub host_name: String, // 房主的用户名
    pub host_id: String,   // 房主的用户ID
    pub password: Option<String>, // 新增：房间密码
    pub is_public: bool,         // 新增：是否为公开房间
}

#[derive(Serialize)]
pub struct CreateRoomResponse {
    pub room_id: String, // 改为String类型
    pub name: String,
    pub max_players: usize,
    pub room_color: String,
    pub host_name: String,
    pub status: String,
    pub message: String,
}

/// POST /api/createRoom
/// 创建新房间
#[post("/createRoom")]
pub async fn create_room(
    game_server: web::Data<Addr<GameServer>>,
    request: web::Json<CreateRoomRequest>,
) -> Result<HttpResponse> {
    // 验证房间名称
    if request.name.trim().is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_name",
            "message": "房间名称不能为空"
        })));
    }
    
    if request.name.len() > 50 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "name_too_long",
            "message": "房间名称不能超过50个字符"
        })));
    }
    
    // 验证最大玩家数
    if request.max_players < 2 || request.max_players > 16 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_max_players",
            "message": "最大玩家数必须在2-16之间"
        })));
    }
    
    // 验证颜色格式 (简单的十六进制颜色验证)
    if !request.room_color.starts_with('#') || request.room_color.len() != 7 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_color",
            "message": "颜色格式无效，请使用十六进制格式如 #FF5733"
        })));
    }
    
    // 验证是否包含禁用内容
    if request.name.to_lowercase().contains("ek") {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "forbidden_content",
            "message": "房间名称包含禁用内容"
        })));
    }
    
    // 验证密码（如果提供）
    if let Some(password) = &request.password {
        if password.len() > 20 {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "password_too_long",
                "message": "密码不能超过20个字符"
            })));
        }
    }

    // 确定房间ID
    let room_id_str = match &request.room_id {
        Some(id) => {
            if let Err(e) = validate_room_id(id) {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "invalid_room_id",
                    "message": e
                })));
            }
            id.clone()
        }
        None => generate_room_id(),
    };

    // 创建房间消息
    let create_room_msg = CreateRoom {
        room_id: Some(room_id_str),
        name: request.name.clone(),
        max_players: request.max_players,
        room_color: request.room_color.clone(),
        host_name: request.host_name.clone(),
        host_id: request.host_id.clone(),
        password: request.password.clone(),
        is_public: request.is_public,
    };

    // 发送消息到GameServer
    match game_server.send(create_room_msg).await {
        Ok(Ok(new_room_id)) => {
            // 房间创建成功
            Ok(HttpResponse::Ok().json(CreateRoomResponse {
                room_id: new_room_id,
                name: request.name.clone(),
                max_players: request.max_players,
                room_color: request.room_color.clone(),
                host_name: request.host_name.clone(),
                status: "waiting".to_string(),
                message: "房间创建成功".to_string(),
            }))
        }
        Ok(Err(e)) => {
            // GameServer返回错误（例如，房间ID已存在）
            Ok(HttpResponse::Conflict().json(serde_json::json!({
                "error": "room_exists",
                "message": e
            })))
        }
        Err(_) => {
            // Actor消息发送失败
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "server_error",
                "message": "无法与游戏服务器通信"
            })))
        }
    }
}

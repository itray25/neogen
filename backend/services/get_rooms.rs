use actix::prelude::*;
use actix_web::{web, HttpResponse, Result, get};
use serde::{Deserialize, Serialize};
use crate::services::ws::{GameServer, GetRoomList};

#[derive(Deserialize)]
pub struct GetRoomsQuery {
    pub start: Option<usize>,
    pub end: Option<usize>,
}

#[derive(Serialize)]
pub struct RoomInfo {
    pub room_id: String, // 保持为String类型以支持自定义房间ID
    pub name: String,
    pub host_name: String, // 改为host_name（房主的用户名）
    pub status: String,
    pub player_count: usize,
    pub max_players: usize,
    pub room_color: String, // 添加房间颜色
    pub required_to_start: usize,
    pub is_active: bool,
    pub has_password: bool, // 新增：是否有密码
}

#[derive(Serialize)]
pub struct GetRoomsResponse {
    pub rooms: Vec<RoomInfo>,
    pub total_count: usize,
    pub start: usize,
    pub end: usize,
    pub has_more: bool,
}

/// GET /api/getRooms?start=a&end=b
/// 获取房间列表，支持分页
#[get("/getRooms")]
pub async fn get_rooms(
    game_server: web::Data<Addr<GameServer>>,
    query: web::Query<GetRoomsQuery>,
) -> Result<HttpResponse> {
    let start = query.start.unwrap_or(0);
    let end = query.end.unwrap_or(start + 10); // 默认返回10个房间
    
    // 验证分页参数
    if start > end {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "invalid_range",
            "message": "start不能大于end"
        })));
    }
    
    if end - start > 100 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "range_too_large", 
            "message": "单次查询最多返回100个房间"
        })));
    }
    
    // 向GameServer请求房间列表
    match game_server.send(GetRoomList).await {
        Ok(room_data) => {
            let total_count = room_data.len();
            
            // 应用分页
            let paginated_rooms: Vec<RoomInfo> = room_data
                .into_iter()
                .filter(|(_, _, _, _, _, _, _, _, _, is_public, _)| *is_public) // 只包含公开房间
                .skip(start)
                .take(end - start)
                .map(|(room_id, name, host_name, status, player_count, max_players, room_color, _force_start_count, required_to_start, _, has_password)| {
                    RoomInfo {
                        room_id, // 直接使用String类型的room_id
                        name,
                        host_name,
                        status,
                        player_count,
                        max_players,
                        room_color,
                        required_to_start,
                        is_active: player_count > 0,
                        has_password,
                    }
                })
                .collect();
            
            let actual_end = std::cmp::min(end, total_count);
            let has_more = actual_end < total_count;
            
            let response = GetRoomsResponse {
                rooms: paginated_rooms,
                total_count,
                start,
                end: actual_end,
                has_more,
            };
            
            Ok(HttpResponse::Ok().json(response))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "server_error",
                "message": "获取房间列表失败"
            })))
        }
    }
}
use std::collections::HashMap;
use actix::prelude::*;
use actix::fut;
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;
use rand::Rng;
use serde_json;
type Coordinate = (i32, i32);
#[derive(Clone)]
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

struct RoomInfo{
    players: Vec<usize>,
    player_count: usize,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
enum UserMessage {
    Move{room_id: usize, sender_id: usize, from: Coordinate, direction: Direction},
    Chat{room_id: usize, sender_id: usize, content: String},
    JoinRoom{room_id: usize, player_id: usize},
    JoinRoomWithName{room_id: usize, player_id: usize, player_name: String},
    ChangeName{room_id: usize, player_id: usize, new_name: String},
    LeaveRoom{room_id: usize, player_id: usize},
    Ok,
    Err(String),
}
// 定义消息类型

#[derive(Message)]
#[rtype(result = "usize")]
struct Connect {
    pub recipient: Recipient<UserMessage>,
}

#[derive(Message)]
#[rtype(result = "()")]
struct Disconnect {
    pub player_id: usize,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
struct ReturnedRoomInfo{
    players: Vec<(usize, String)>,
    player_count: usize,
}

#[derive(Message)]
#[rtype(result = "ReturnedRoomInfo")]
struct GetRoomInfo {
    pub room_id: usize,
}


#[derive(Default)]
pub struct GameServer {
    player_sessions: HashMap<usize, Recipient<UserMessage>>,  // 存储所有活跃的用户会话（这里只处理MoveMessage，其他消息类型可扩展）
    rooms: HashMap<usize, RoomInfo>,                // 房间 -> 用户ID列表的映射                                   // 下一个可用的用户ID
    user_name_table: HashMap<usize, String>,
}

// GameServer 作为 Actor
impl GameServer {
    fn get_room_info(&mut self, room_id: usize) -> ReturnedRoomInfo {
        if let Some(room) = self.rooms.get(&room_id) {
            let players = room.players.iter().map(|&id| (id, self.user_name_table.get(&id).unwrap_or(&"Unknown".into()).clone())).collect();
            ReturnedRoomInfo {
                players,
                player_count: room.player_count,
            }
        } else {
            ReturnedRoomInfo {
                players: Vec::new(),
                player_count: 0,
            }
        }
    }
}
impl Actor for GameServer {
    type Context = Context<Self>;
    fn started(&mut self, _ctx: &mut Self::Context) {
        println!("GameServer started");
    }
    fn stopped(&mut self, _ctx: &mut Self::Context) {
        println!("GameServer stopped");
    }
}

impl Handler<Connect> for GameServer {
    type Result = usize; // 返回分配的用户ID

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        // 为新连接分配一个唯一的用户ID
                loop {
            let id: usize = rand::rng().random_range(10000000..=99999999);
            // 确保ID不重复
            if !self.player_sessions.contains_key(&id) {
                self.player_sessions.insert(id, msg.recipient);
                self.user_name_table.insert(id, format!("User{}", id));
                return id;
            }
        }
    }
}

impl Handler<Disconnect> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        // 移除用户会话
        self.player_sessions.remove(&msg.player_id);
        // 从所有房间中移除用户
        for players in self.rooms.values_mut() {
            if players.players.contains(&msg.player_id) {
                players.players.retain(|&id| id != msg.player_id);
                players.player_count -= 1;
        }
    }
}}

impl Handler<GetRoomInfo> for GameServer {
    type Result = MessageResult<GetRoomInfo>;

    fn handle(&mut self, msg: GetRoomInfo, _: &mut Context<Self>) -> Self::Result {
        if let Some(room) = self.rooms.get(&msg.room_id) {
            let players = room.players.iter().map(|&id| (id, self.user_name_table.get(&id).unwrap_or(&"Unknown".into()).clone())).collect();
            MessageResult(ReturnedRoomInfo {
                players,
                player_count: room.player_count,
            })
        } else {
            MessageResult(ReturnedRoomInfo {
                players: Vec::new(),
                player_count: 0,
            })
        }
    }
}

impl Handler<UserMessage> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: UserMessage, _: &mut Context<Self>) {
        match msg {
            UserMessage::Move { room_id, sender_id, from, direction } => {
                // to be constructed
            }
            UserMessage::Chat { room_id, sender_id, content } => {
                if let Some(room) = self.rooms.get(&room_id) {
                    for &player_id in &room.players {
                        if player_id != sender_id {
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Chat {
                                    room_id,
                                    sender_id,
                                    content: content.clone(),
                                });
                            }
                        }else{
                            // 给自己也发一份确认
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Ok);
                            }
                    }
                }
            }}
            UserMessage::JoinRoom { room_id, player_id } => {
                let room: &mut RoomInfo = self.rooms.entry(room_id).or_insert_with(|| RoomInfo {
                    players: Vec::new(),
                    player_count: 0,
                });
                if !room.players.contains(&player_id) {
                    room.players.push(player_id);
                    room.player_count += 1;
                    for &player in &room.players {
                        if player != player_id {
                            // 通知其他玩家加入房间
                            if let Some(recipient) = self.player_sessions.get(&player) {
                                let _ = recipient.do_send(UserMessage::JoinRoomWithName{
                                    room_id,
                                    player_id,
                                    player_name: self.user_name_table.get(&player_id).unwrap_or(&"Unknown".into()).clone(),
                                });
                            }
                        }else{
                            // 给自己也发一份确认
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Ok);
                            }
                        }
                    }
                }}
                UserMessage::ChangeName { room_id, player_id, new_name } => {
                    let room: &mut RoomInfo = self.rooms.get_mut(&room_id).expect("Room not found");
                    if let Some(name) = self.user_name_table.get_mut(&player_id) {
                        if new_name.contains('<') || new_name.contains('>') || new_name.contains('&') || new_name.contains('"') || new_name.contains('\''){
                            // 给自己也发一份错误信息
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Err("Name contains invalid characters".into()));
                            }
                            return;
                        }else if new_name.contains("ek"){
                            // 给自己也发一份错误信息
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Err("No ek allowed here".into()));
                            }
                            return;
                        }else{
                        *name = new_name.clone();
                        }
                    }
                    // 广播用户名更改
                    for &player in &room.players {
                            if player != player_id {
                            if let Some(recipient) = self.player_sessions.get(&player) {
                        let _ = recipient.do_send(UserMessage::Chat {
                            room_id: room_id,
                            sender_id: player_id,
                            content: format!("User {} changed name to {}", player_id, new_name),
                        });
                        }}else{
                            // 给自己也发一份确认
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Ok);
                            }
                    }
                }}
                UserMessage::LeaveRoom { room_id, player_id } => {
                    if let Some(room) = self.rooms.get_mut(&room_id) {
                        // 从房间中移除玩家
                        if room.players.contains(&player_id) {
                            room.players.retain(|&id| id != player_id);
                            room.player_count -= 1;
                            
                            // 获取离开玩家的用户名
                            let player_name = self.user_name_table.get(&player_id)
                                .unwrap_or(&"Unknown".into()).clone();
                            
                            // 向房间内其他玩家广播离开信息
                            for &other_player_id in &room.players {
                                if let Some(recipient) = self.player_sessions.get(&other_player_id) {
                                    let _ = recipient.do_send(UserMessage::Chat {
                                        room_id,
                                        sender_id: player_id,
                                        content: format!("{} left the room", player_name),
                                    });
                                }
                            }
                            
                            // 给离开的玩家发送确认
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Ok);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

pub struct UserSession {
    id: usize,
    room_id: usize,
    addr: Addr<GameServer>,
}
impl UserSession {
    pub fn new(room_id: usize, addr: Addr<GameServer>) -> Self {
        Self {
            id: 0,
            room_id,
            addr,
        }
    }
}
impl Actor for UserSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let addr: Addr<UserSession> = ctx.address(); // address of this actor
        self.addr
            .send(Connect {
                recipient: addr.recipient(),
            })
            .into_actor(self)
            .then(|res, act, ctx| {
                match res {
                    Ok(id) => {
                        act.id = id;
                        // 加入房间
                        act.addr.do_send(UserMessage::JoinRoom {
                            room_id: act.room_id,
                            player_id: act.id,
                        });
                    }
                    _ => ctx.stop(),
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn stopped(&mut self, _: &mut Self::Context) {
        self.addr.do_send(Disconnect { player_id: self.id });
    }
}
impl Handler<UserMessage> for UserSession {
    type Result = ();

    fn handle(&mut self, msg: UserMessage, ctx: &mut Self::Context) {
        match msg {
            UserMessage::Move { room_id, sender_id, from, direction } => {
                        // to be constructed
                    }
            UserMessage::Chat { room_id, sender_id, content } => {
                        let chat_json = serde_json::json!({
                            "type": "chat",
                            "room_id": room_id,
                            "sender_id": sender_id,
                            "content": content,
                        });
                        ctx.text(chat_json.to_string());
                    }
            UserMessage::JoinRoomWithName { room_id, player_id, player_name } => {
                        let join_json = serde_json::json!({
                            "type": "join_room",
                            "room_id": room_id,
                            "player_id": player_id,
                            "player_name": player_name,
                        });
                        ctx.text(join_json.to_string());
                    }
            UserMessage::ChangeName { room_id, player_id, new_name } => {
                let change_name_json = serde_json::json!({
                    "type": "change_name",
                    "room_id": room_id,
                    "player_id": player_id,
                    "new_name": new_name,
                });
                ctx.text(change_name_json.to_string());
            },
            UserMessage::LeaveRoom { room_id, player_id } => {
                let leave_json = serde_json::json!({
                    "type": "leave_room",
                    "room_id": room_id,
                    "player_id": player_id,
                });
                ctx.text(leave_json.to_string());
            },
            UserMessage::Ok => {
                let ok_json = serde_json::json!({
                    "type": "ok",
                });
                ctx.text(ok_json.to_string());
            }
            UserMessage::Err(err_msg) => {
                let err_json = serde_json::json!({
                    "type": "error",
                    "message": err_msg,
                });
                ctx.text(err_json.to_string());
            }
            _ => {}
        }
    }
}

impl Handler<ReturnedRoomInfo> for UserSession {
    type Result = ();

    fn handle(&mut self, msg: ReturnedRoomInfo, ctx: &mut Self::Context) {
        let room_info_json = serde_json::json!({
            "type": "room_info",
            "players": msg.players,
            "player_count": msg.player_count,
        });
        ctx.text(room_info_json.to_string());
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for UserSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Text(text)) => {
                println!("Received message from user {}: {}", self.id, text);
                // 解析客户端发送的 JSON 消息
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(msg_type) = json["type"].as_str() {
                        match msg_type {
                            "move"=>{}
                            "chat" => {
                                if let Some(content) = json["content"].as_str() {
                                    self.addr.do_send(UserMessage::Chat {
                                        room_id: self.room_id,
                                        sender_id: self.id,
                                        content: content.to_string(),
                                    });
                                }
                            }
                            "join_room" => {
                                if let Some(room_id) = json["room_id"].as_u64() {
                                    self.room_id = room_id as usize; // 更新当前房间ID
                                    self.addr.do_send(UserMessage::JoinRoom {
                                        room_id: room_id as usize,
                                        player_id: self.id,
                                    });
                                }
                            }
                            "change_name" => {
                                if let Some(new_name) = json["new_name"].as_str() {
                                    self.addr.do_send(UserMessage::ChangeName {
                                        room_id: self.room_id,
                                        player_id: self.id,
                                        new_name: new_name.to_string(),
                                    });
                                }
                            }
                            "get_room_info" => {
                                self.addr.do_send(GetRoomInfo {
                                    room_id: self.room_id,
                                });
                            },
                            "leave_room" => {
                                if let Some(room_id) = json["room_id"].as_u64() {
                                    self.addr.do_send(UserMessage::LeaveRoom {
                                        room_id: room_id as usize,
                                        player_id: self.id,
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => {}
        }
    }
}
pub async fn websocket_handler(
    req: HttpRequest,
    stream: web::Payload,
    game_server: web::Data<Addr<GameServer>>,
) -> Result<HttpResponse, actix_web::Error> {
    // 默认房间 ID 为 1
    let room_id = 1;
    
    println!("新的 WebSocket 连接建立");
    
    let user_session = UserSession::new(room_id, game_server.get_ref().clone());
    ws::start(user_session, &req, stream)
}
pub fn create_game_server() -> Addr<GameServer> {
    GameServer::default().start()
}
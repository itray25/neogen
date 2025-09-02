use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use actix::prelude::*;
use actix::fut;
use actix_web::{ web, HttpRequest, HttpResponse };
use actix_web_actors::ws;
use serde_json;
type Coordinate = (i32, i32);

#[derive(Clone, Debug, PartialEq)]
enum Tile {
    Wilderness,                           // w: 无主之地
    Territory { count: u8, user_id: String }, // t: 玩家领地，兵力count，玩家user_id
    Mountain,                            // m: 山（暂未使用）
    General { count: u8, user_id: String }, // g: 王城，兵力count，玩家user_id
    Void,                               // v: 占位符，空白（暂未使用）
}

impl Tile {
    fn get_count(&self) -> u8 {
        match self {
            Tile::Territory { count, .. } => *count,
            Tile::General { count, .. } => *count,
            _ => 0,
        }
    }
    
    fn get_user_id(&self) -> Option<&String> {
        match self {
            Tile::Territory { user_id, .. } => Some(user_id),
            Tile::General { user_id, .. } => Some(user_id),
            _ => None,
        }
    }
    
    fn set_count(&mut self, new_count: u8) {
        match self {
            Tile::Territory { count, .. } => *count = new_count,
            Tile::General { count, .. } => *count = new_count,
            _ => {} // 其他类型不支持设置兵力
        }
    }
}

#[derive(Clone, Debug)]
struct GameMap {
    tiles: Vec<Vec<Tile>>,
    width: usize,
    height: usize,
}

impl GameMap {
    fn new(width: usize, height: usize) -> Self {
        // 创建空的地图，王城将在后续根据实际队伍动态设置
        let tiles = vec![vec![Tile::Wilderness; width]; height];
        
        Self { tiles, width, height }
    }
    
    // 在指定位置设置王城
    fn set_general(&mut self, x: usize, y: usize, team_id: String, initial_count: u8) -> Result<(), String> {
        if x >= self.width || y >= self.height {
            return Err("位置超出地图边界".to_string());
        }
        
        self.tiles[y][x] = Tile::General { 
            count: initial_count, 
            user_id: team_id 
        };
        Ok(())
    }
    
    fn get_tile(&self, x: usize, y: usize) -> Option<&Tile> {
        if x < self.width && y < self.height {
            Some(&self.tiles[y][x])
        } else {
            None
        }
    }
    
    fn get_tile_mut(&mut self, x: usize, y: usize) -> Option<&mut Tile> {
        if x < self.width && y < self.height {
            Some(&mut self.tiles[y][x])
        } else {
            None
        }
    }
    
    // 获取玩家可见区域（拥有的领地及其周围9格）
    fn get_visible_tiles(&self, user_id: &str) -> Vec<(usize, usize, Tile)> {
        let mut visible = Vec::new();
        let mut checked = std::collections::HashSet::new();
        
        // 找到所有玩家拥有的tile
        for y in 0..self.height {
            for x in 0..self.width {
                let tile = &self.tiles[y][x];
                if let Some(owner) = tile.get_user_id() {
                    if owner == user_id {
                        // 添加该tile及其周围9格
                        for dy in -1..=1 {
                            for dx in -1..=1 {
                                let nx = x as i32 + dx;
                                let ny = y as i32 + dy;
                                if nx >= 0 && ny >= 0 && nx < self.width as i32 && ny < self.height as i32 {
                                    let nx = nx as usize;
                                    let ny = ny as usize;
                                    if !checked.contains(&(nx, ny)) {
                                        checked.insert((nx, ny));
                                        if let Some(visible_tile) = self.get_tile(nx, ny) {
                                            if !matches!(visible_tile, Tile::Void) {
                                                visible.push((nx, ny, visible_tile.clone()));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        visible
    }
    
    // 执行移动命令，返回是否有玩家获胜
    fn execute_move(&mut self, from_x: usize, from_y: usize, to_x: usize, to_y: usize, team_id: &str) -> Result<Option<String>, String> {
        println!("执行移动: 从({},{}) 到({},{}) 队伍: {}", from_x, from_y, to_x, to_y, team_id);
        
        // 验证坐标有效性
        if from_x >= self.width || from_y >= self.height || to_x >= self.width || to_y >= self.height {
            return Err("坐标超出地图范围".to_string());
        }
        
        // 验证移动距离（只能移动到相邻格子）
        let dx = (to_x as i32 - from_x as i32).abs();
        let dy = (to_y as i32 - from_y as i32).abs();
        if (dx != 1 || dy != 0) && (dx != 0 || dy != 1) {
            return Err("只能移动到相邻的格子".to_string());
        }
        
        // 获取源位置的瓦片
        let from_tile = self.get_tile(from_x, from_y).cloned();
        
        match from_tile {
            Some(from_tile) => {
                println!("源位置({},{})的瓦片: {:?}", from_x, from_y, from_tile);
                
                // 验证源位置是玩家控制的
                if let Some(owner) = from_tile.get_user_id() {
                    if owner != team_id {
                        return Err(format!("只能移动自己的兵力，源位置属于: {}", owner));
                    }
                } else {
                    return Err("源位置没有可移动的兵力".to_string());
                }
                
                // 获取起始兵力数量 n
                let n = from_tile.get_count();
                println!("源位置兵力: {}", n);
                if n <= 1 {
                    return Err(format!("兵力不足，无法移动 (当前兵力: {})", n));
                }
                
                // 将起始位置兵力设为1
                if let Some(source_tile) = self.get_tile_mut(from_x, from_y) {
                    source_tile.set_count(1);
                }
                
                // 处理目标位置
                if let Some(target_tile) = self.get_tile_mut(to_x, to_y) {
                    match target_tile {
                        Tile::Wilderness => {
                            // 1. 若为w，变为己方t，兵力为n-1
                            *target_tile = Tile::Territory { count: n - 1, user_id: team_id.to_string() };
                        }
                        Tile::Territory { count: m, user_id } => {
                            if user_id == team_id {
                                // 2. 若为我方t（兵力为m），兵力增为m+n-1
                                *m = *m + n - 1;
                            } else {
                                // 3. 若为敌方t（兵力m），如果n-1>m，变为己方t（兵力n-1-m）；反之小于等于，变为敌方t（兵力m-n+1）
                                if n - 1 > *m {
                                    *target_tile = Tile::Territory { count: (n - 1) - *m, user_id: team_id.to_string() };
                                } else {
                                    *m = *m - (n - 1);
                                }
                            }
                        }
                        Tile::General { count: m, user_id } => {
                            if user_id == team_id {
                                // 己方王城，兵力增加
                                *m = *m + n - 1;
                            } else {
                                // 4. 若为敌方g（兵力m），如果n-1>m，判定对方失败，游戏结束；反之小于等于，变为敌方g（兵力m-n+1）
                                if n - 1 > *m {
                                    // 对方失败，游戏结束，返回获胜队伍
                                    return Ok(Some(team_id.to_string()));
                                } else {
                                    *m = *m - (n - 1);
                                }
                            }
                        }
                        Tile::Mountain => {
                            return Err("无法移动到山地".to_string());
                        }
                        Tile::Void => {
                            return Err("无法移动到空白区域".to_string());
                        }
                    }
                } else {
                    return Err("目标位置无效".to_string());
                }
                
                Ok(None) // 游戏继续
            }
            None => Err("源位置无效".to_string()),
        }
    }
    
    // 增加所有王城的兵力
    fn increase_general_troops(&mut self) {
        for row in &mut self.tiles {
            for tile in row {
                if let Tile::General { count, .. } = tile {
                    *count += 1;
                }
            }
        }
    }
    
    // 增加所有领地和王城的兵力
    fn increase_all_troops(&mut self) {
        for row in &mut self.tiles {
            for tile in row {
                match tile {
                    Tile::Territory { count, .. } | Tile::General { count, .. } => {
                        *count += 1;
                    }
                    _ => {}
                }
            }
        }
    }
}

#[derive(Clone)]
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

#[derive(Clone, Debug)]
struct GroupInfo {
    id: u8,           // 组ID: 0-7为玩家组，8为观众组
    name: String,     // 组名称
    color: String,    // 组颜色
    players: Vec<String>, // 组内玩家ID列表
}

impl GroupInfo {
    fn new(id: u8) -> Self {
        let (name, color) = match id {
            0 => ("红队".to_string(), "#FF4444".to_string()),
            1 => ("蓝队".to_string(), "#4444FF".to_string()),
            2 => ("绿队".to_string(), "#44FF44".to_string()),
            3 => ("黄队".to_string(), "#FFFF44".to_string()),
            4 => ("紫队".to_string(), "#FF44FF".to_string()),
            5 => ("青队".to_string(), "#44FFFF".to_string()),
            6 => ("橙队".to_string(), "#FF8844".to_string()),
            7 => ("粉队".to_string(), "#FF8888".to_string()),
            8 => ("观众".to_string(), "#888888".to_string()),
            _ => ("未知".to_string(), "#000000".to_string()),
        };
        
        GroupInfo {
            id,
            name,
            color,
            players: Vec::new(),
        }
    }
}

struct RoomInfo {
    name: String,
    host_player_id: String, // 存储player_id (userid)
    host_player_name: String,
    admin_player_id: Option<String>, // 新增：管理员player_id
    admin_player_name: Option<String>, // 新增：管理员用户名
    status: String, // "waiting", "playing", "game_turn"
    max_players: usize, // 最大玩家数
    room_color: String, // 房间专属颜色
    players: Vec<String>, // 存储player_id (userid)的列表
    player_count: usize,
    force_start_players: Vec<String>, // 存储player_id (userid)的列表
    last_activity: u64, // 最后活动时间戳（秒）
    password: Option<String>, // 新增：房间密码
    is_public: bool,         // 新增：是否为公开房间
    groups: Vec<GroupInfo>,  // 新增：分组信息
    player_groups: HashMap<String, u8>, // 新增：玩家ID -> 组ID映射
    // 游戏回合制相关字段
    game_turn: u32, // 当前回合数
    turn_half: bool, // true为上半回合(0-0.5s), false为下半回合(0.5-1s)
    player_actions: HashMap<String, String>, // 玩家ID -> 动作信息
    turn_start_time: Option<std::time::Instant>, // 回合开始时间
    // 游戏地图相关字段
    game_map: Option<GameMap>, // 游戏地图
    player_teams: HashMap<String, String>, // 玩家ID -> 队伍ID映射
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
struct ReturnedRoomInfo {
    name: String,
    host_player_name: String, // 只返回用户名，不返回userid
    admin_player_name: Option<String>, // 新增：管理员用户名
    status: String,
    players: Vec<String>, // 只返回用户名列表，不返回userid
    player_count: usize,
    force_start_players: Vec<String>, // 只返回用户名列表，不返回userid
    required_to_start: usize,
    groups: Vec<ReturnedGroupInfo>, // 新增：分组信息
    room_id: String, // 新增：房间ID
    max_players: usize, // 新增：最大玩家数
}

#[derive(Clone, Debug)]
struct ReturnedGroupInfo {
    id: u8,
    players: Vec<String>, // 只返回用户名列表，颜色和名称前端处理
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
enum UserMessage {
    Move {
        room_id: String,
        sender_id: String,
        from: Coordinate,
        direction: Direction,
    },
    GameMove {
        room_id: String,
        player_id: String,
        from_x: usize,
        from_y: usize,
        to_x: usize,
        to_y: usize,
    },
    Chat {
        room_id: String,
        sender_id: String,
        username: String,
        content: String,
    },
    JoinRoomWithName {
        room_id: String,
        player_id: String,
        player_name: String,
        password: Option<String>, // 新增：加入房间时提供的密码
    },
    LeaveRoom {
        room_id: String,
        player_id: String,
    },
    ForceStart {
        room_id: String,
        player_id: String,
    },
    DeForceStart {
        room_id: String,
        player_id: String,
    },
    SetAdmin {
        room_id: String,
        host_id: String,
        target_player_name: String,
    },
    RemoveAdmin {
        room_id: String,
        host_id: String,
    },
    KickPlayer {
        room_id: String,
        kicker_id: String,
        target_player_name: String,
    },
    ChangeGroup {
        room_id: String,
        player_id: String,
        target_group_id: u8,
    },
    SetUserInfo {
        user_id: String,
        username: String,
    },
    RoomInfoUpdate(ReturnedRoomInfo),
    RedirectToHome {
        reason: String,
    },
    StartGame {
        room_id: String,
    },
    EndGame {
        room_id: String,
    },
    GameAction {
        room_id: String,
        player_id: String,
        action: String, // 玩家动作信息
    },
    GameTurnUpdate {
        room_id: String,
        turn: u32,
        turn_half: bool,
        actions: Vec<(String, String)>, // (player_name, action)
    },
    MapUpdate {
        room_id: String,
        visible_tiles: Vec<(usize, usize, String, u8, Option<String>)>, // (x, y, tile_type, count, user_id)
    },
    GameWin {
        room_id: String,
        winner: String,
    },
    Ok,
    Err(String),
}
// 定义消息类型

#[derive(Message)]
#[rtype(result = "Result<(), String>")]
struct Connect {
    pub user_id: String,
    pub username: String,
    pub recipient: Recipient<UserMessage>,
}

#[derive(Message)]
#[rtype(result = "()")]
struct Disconnect {
    pub player_id: String,
}

#[derive(Message)]
#[rtype(result = "ReturnedRoomInfo")]
struct GetRoomInfo {
    pub room_id: String,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct CleanupInactiveRooms;

#[derive(Message)]
#[rtype(result = "Vec<(String, String, String, String, usize, usize, String, usize, usize, bool, bool)>")]
pub struct GetRoomList;

#[derive(Message)]
#[rtype(result = "Result<String, String>")] // 返回创建的房间ID或错误信息
pub struct CreateRoom {
    pub room_id: Option<String>,
    pub name: String,
    pub max_players: usize,
    pub room_color: String,
    pub host_name: String,
    pub host_id: String,
    pub password: Option<String>,
    pub is_public: bool,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct EndGameMessage {
    pub room_id: String,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct GameTurnMessage {
    pub room_id: String,
}

#[derive(Clone)]
pub struct CreateRoomResult {
    pub success: bool,
    pub room_id: String,
    pub name: String,
    pub max_players: usize,
    pub room_color: String,
    pub host_name: String,
    pub status: String,
    pub error_message: Option<String>,
}

pub struct GameServer {
    player_sessions: HashMap<String, Recipient<UserMessage>>, // userid -> session
    rooms: HashMap<String, RoomInfo>, // room_id -> room_info
    user_name_table: HashMap<String, String>, // userid -> username
    kicked_players: HashMap<String, HashMap<String, u64>>, // room_id -> (userid -> kick_time)
}

impl Default for GameServer {
    fn default() -> Self {
        let mut rooms = HashMap::new();
        
        // 创建全局聊天房间
        rooms.insert("global".to_string(), RoomInfo {
            name: "全局聊天".to_string(),
            host_player_id: "system".to_string(),
            host_player_name: "系统".to_string(),
            admin_player_id: None, // 全局房间无管理员
            admin_player_name: None,
            status: "active".to_string(),
            max_players: 1000, // 全局房间支持大量用户
            room_color: "#10B981".to_string(), // 绿色表示全局房间
            players: Vec::new(),
            force_start_players: Vec::new(),
            player_count: 0,
            last_activity: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            password: None, // 全局房间无密码
            is_public: false, // 全局房间不公开在列表
            groups: (0..9).map(|i| GroupInfo::new(i)).collect(), // 初始化9个组
            player_groups: HashMap::new(), // 初始化玩家组映射
            // 游戏回合制字段
            game_turn: 0,
            turn_half: true,
            player_actions: HashMap::new(),
            turn_start_time: None,
            // 游戏地图字段
            game_map: None,
            player_teams: HashMap::new(),
        });
        
        Self {
            player_sessions: HashMap::new(),
            rooms,
            user_name_table: HashMap::new(),
            kicked_players: HashMap::new(),
        }
    }
}

// GameServer 作为 Actor
impl GameServer {
    pub fn new() -> GameServer {
        let mut rooms = HashMap::new();
        // 初始化一个全局房间
        rooms.insert("global".to_string(), RoomInfo {
            name: "Global".to_string(),
            host_player_id: "system".to_string(),
            host_player_name: "System".to_string(),
            admin_player_id: None, // 全局房间无管理员
            admin_player_name: None,
            status: "active".to_string(),
            max_players: 1000, // 假设全局房间有很大容量
            room_color: "#FFFFFF".to_string(),
            players: Vec::new(),
            player_count: 0,
            force_start_players: Vec::new(),
            last_activity: 0,
            password: None, // 全局房间无密码
            is_public: false, // 全局房间不公开在列表
            groups: (0..9).map(|i| GroupInfo::new(i)).collect(), // 初始化9个组
            player_groups: HashMap::new(), // 初始化玩家组映射
            // 游戏回合制字段
            game_turn: 0,
            turn_half: true,
            player_actions: HashMap::new(),
            turn_start_time: None,
            // 游戏地图字段
            game_map: None,
            player_teams: HashMap::new(),
        });

        GameServer {
            player_sessions: HashMap::new(),
            rooms,
            user_name_table: HashMap::new(),
            kicked_players: HashMap::new(),
        }
    }

    // 获取当前时间戳（秒）
    fn current_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    // 更新房间活动时间
    fn update_room_activity(&mut self, room_id: &str) {
        if let Some(room) = self.rooms.get_mut(room_id) {
            room.last_activity = Self::current_timestamp();
        }
    }

    // 检查玩家是否被踢出指定房间且仍在冷却时间内
    fn is_player_kicked_from_room(&mut self, player_id: &str, room_id: &str) -> bool {
        let current_time = Self::current_timestamp();
        let five_minutes = 5 * 60; // 5分钟 = 300秒
        
        if let Some(room_kicks) = self.kicked_players.get_mut(room_id) {
            if let Some(&kick_time) = room_kicks.get(player_id) {
                if current_time - kick_time < five_minutes {
                    return true;
                } else {
                    // 冷却时间已过，移除记录
                    room_kicks.remove(player_id);
                    // 如果该房间没有踢出记录了，移除整个房间记录
                    if room_kicks.is_empty() {
                        self.kicked_players.remove(room_id);
                    }
                }
            }
        }
        false
    }

    // 广播消息给所有在线玩家
    fn broadcast_to_all_players(&self, message: &str) {
        for (player_id, recipient) in &self.player_sessions {
            let _ = recipient.do_send(UserMessage::Chat {
                room_id: "global".to_string(),
                sender_id: "system".to_string(),
                username: "系统广播".to_string(),
                content: message.to_string(),
            });
        }
    }

    // 为玩家分配到最小的组（优先分配到玩家组0-7，如果都满了则分配到观众组8）
    fn assign_player_to_smallest_group(&mut self, room_id: &str, player_id: &str) {
        if let Some(room) = self.rooms.get_mut(room_id) {
            // 找到人数最少的玩家组（0-7）
            let mut smallest_group_id = 0u8;
            let mut smallest_group_size = usize::MAX;
            
            for i in 0..8 { // 只考虑玩家组0-7
                if let Some(group) = room.groups.get(i) {
                    if group.players.len() < smallest_group_size {
                        smallest_group_size = group.players.len();
                        smallest_group_id = i as u8;
                    }
                }
            }
            
            // 如果所有玩家组都满了（假设每组最大2人），则分配到观众组
            if smallest_group_size >= 2 {
                smallest_group_id = 8; // 观众组
            }
            
            // 将玩家添加到选定的组
            if let Some(group) = room.groups.get_mut(smallest_group_id as usize) {
                group.players.push(player_id.to_string());
                room.player_groups.insert(player_id.to_string(), smallest_group_id);
                println!("玩家 {} 被自动分配到组 {} ({})", player_id, smallest_group_id, group.name);
            }
        }
    }

    // 切换玩家组别
    fn change_player_group(&mut self, room_id: &str, player_id: &str, target_group_id: u8) -> Result<(), String> {
        if target_group_id > 8 {
            return Err("无效的组ID".to_string());
        }
        
        if let Some(room) = self.rooms.get_mut(room_id) {
            // 从当前组中移除玩家
            if let Some(&current_group_id) = room.player_groups.get(player_id) {
                if let Some(current_group) = room.groups.get_mut(current_group_id as usize) {
                    current_group.players.retain(|id| id != player_id);
                }
            }
            
            // 添加到新组
            if let Some(target_group) = room.groups.get_mut(target_group_id as usize) {
                target_group.players.push(player_id.to_string());
                room.player_groups.insert(player_id.to_string(), target_group_id);
                println!("玩家 {} 切换到组 {} ({})", player_id, target_group_id, target_group.name);
                Ok(())
            } else {
                Err("目标组不存在".to_string())
            }
        } else {
            Err("房间不存在".to_string())
        }
    }

    // 从所有组中移除玩家（当玩家离开房间时调用）
    fn remove_player_from_groups(&mut self, room_id: &str, player_id: &str) {
        if let Some(room) = self.rooms.get_mut(room_id) {
            // 从玩家组映射中移除
            if let Some(group_id) = room.player_groups.remove(player_id) {
                // 从对应组中移除玩家
                if let Some(group) = room.groups.get_mut(group_id as usize) {
                    group.players.retain(|id| id != player_id);
                    println!("玩家 {} 从组 {} ({}) 中移除", player_id, group_id, group.name);
                }
            }
        }
    }

    fn get_room_info(&mut self, room_id: &str) -> Option<ReturnedRoomInfo> {
        if let Some(room) = self.rooms.get(room_id) {
            let players = room.players
                .iter()
                .map(|id| self.user_name_table.get(id).unwrap_or(&"Unknown".to_string()).clone())
                .collect();
            
            let force_start_players = room.force_start_players
                .iter()
                .map(|id| self.user_name_table.get(id).unwrap_or(&"Unknown".to_string()).clone())
                .collect();
            
            // 生成分组信息，只传递ID和玩家列表
            let groups = room.groups
                .iter()
                .map(|group_info| {
                    let group_players = group_info.players
                        .iter()
                        .map(|id| self.user_name_table.get(id).unwrap_or(&"Unknown".to_string()).clone())
                        .collect();
                    
                    ReturnedGroupInfo {
                        id: group_info.id,
                        players: group_players,
                    }
                })
                .collect();
            
            // 对于全局房间，不需要强制开始逻辑
            let required_to_start = if room_id == "global" {
                0
            } else {
                let force_start_n_dict = HashMap::from([
                    (2, 2), (3, 3), (4, 3), (5, 4), (6, 4),
                    (7, 5), (8, 5), (9, 6), (10, 6), (11, 7),
                    (12, 7), (13, 8), (14, 8), (15, 9), (16, 9),
                ]);
                *force_start_n_dict.get(&room.players.len()).unwrap_or(&room.players.len())
            };

            Some(ReturnedRoomInfo {
                name: room.name.clone(),
                host_player_name: room.host_player_name.clone(),
                admin_player_name: room.admin_player_name.clone(),
                status: room.status.clone(),
                players,
                player_count: room.player_count,
                force_start_players,
                required_to_start,
                groups,
                room_id: room_id.to_string(),
                max_players: room.max_players,
            })
        } else {
            None
        }
    }

    fn broadcast_room_info(&self, room_id: &str, room_info: ReturnedRoomInfo) {
        if let Some(room) = self.rooms.get(room_id) {
            for player_id in &room.players {
                if let Some(recipient) = self.player_sessions.get(player_id) {
                    let _ = recipient.do_send(UserMessage::RoomInfoUpdate(room_info.clone()));
                }
            }
        }
    }
}
impl Actor for GameServer {
    type Context = Context<Self>;
    fn started(&mut self, ctx: &mut Self::Context) {
        println!("GameServer started");
        
        // 启动定时清理任务：每分钟检查一次
        ctx.run_interval(std::time::Duration::from_secs(60), |_act, ctx| {
            ctx.address().do_send(CleanupInactiveRooms);
        });
    }
    fn stopped(&mut self, _ctx: &mut Self::Context) {
        println!("GameServer stopped");
    }
}

impl Handler<Connect> for GameServer {
    type Result = Result<(), String>;

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        // 检查用户ID是否已经存在
        if self.player_sessions.contains_key(&msg.user_id) {
            return Err(format!("用户ID {} 已经在线", msg.user_id));
        }
        
        println!("新连接注册会话: 用户ID={}, 用户名={}", msg.user_id, msg.username);
        
        // 注册会话和用户名
        self.player_sessions.insert(msg.user_id.clone(), msg.recipient);
        self.user_name_table.insert(msg.user_id.clone(), msg.username.clone());
        
        // 自动加入全局聊天房间
        if let Some(global_room) = self.rooms.get_mut("global") {
            if !global_room.players.contains(&msg.user_id) {
                println!("将用户 {} 自动添加到全局房间", msg.user_id);
                global_room.players.push(msg.user_id.clone());
                global_room.player_count += 1;
                
                // 广播全局房间信息更新
                if let Some(room_info) = self.get_room_info("global") {
                    self.broadcast_room_info("global", room_info);
                }
            }
        }
        
        Ok(())
    }
}

impl Handler<Disconnect> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        // 移除用户会话
        self.player_sessions.remove(&msg.player_id);
        let mut rooms_to_update = Vec::new();
        
        // 从所有房间中移除用户（包括global房间，因为用户完全断开连接了）
        for (room_id, room) in self.rooms.iter_mut() {
            if room.players.contains(&msg.player_id) {
                room.players.retain(|id| id != &msg.player_id);
                room.force_start_players.retain(|id| id != &msg.player_id);
                room.player_count -= 1;
                rooms_to_update.push(room_id.clone());
            }
            // 遍历所有分组，将该玩家移除
            for group in room.groups.iter_mut() {
                group.players.retain(|id| id != &msg.player_id);
            }
            // 同时移除分组映射
            room.player_groups.remove(&msg.player_id);
        }

        // 更新所有受影响的房间
        for room_id in rooms_to_update {
            if let Some(room_info) = self.get_room_info(&room_id) {
                self.broadcast_room_info(&room_id, room_info);
            }
        }
        
        // 移除用户名表中的记录
        self.user_name_table.remove(&msg.player_id);
    }
}

impl Handler<GetRoomInfo> for GameServer {
    type Result = MessageResult<GetRoomInfo>;

    fn handle(&mut self, msg: GetRoomInfo, _: &mut Context<Self>) -> Self::Result {
        if let Some(room_info) = self.get_room_info(&msg.room_id) {
            MessageResult(room_info)
        } else {
            MessageResult(ReturnedRoomInfo {
                name: "Unknown Room".to_string(),
                host_player_name: "Unknown".to_string(),
                admin_player_name: None,
                status: "waiting".to_string(),
                players: Vec::new(),
                player_count: 0,
                force_start_players: Vec::new(),
                required_to_start: 0,
                groups: Vec::new(), // 新增：空的分组列表
                room_id: msg.room_id,
                max_players: 16,
            })
        }
    }
}

impl Handler<GetRoomList> for GameServer {
    type Result = MessageResult<GetRoomList>;

    fn handle(&mut self, _: GetRoomList, _: &mut Context<Self>) -> Self::Result {
        let room_list = self.rooms.iter()
            .filter(|(id, _)| *id != "global") // 过滤掉全局房间
            .map(|(id, room)| {
                (
                    id.clone(),
                    room.name.clone(),
                    room.host_player_name.clone(),
                    room.status.clone(),
                    room.player_count,
                    room.max_players,
                    room.room_color.clone(),
                    room.force_start_players.len(),
                    (room.max_players as f32 * 0.6).ceil() as usize, // 假设需要60%玩家准备
                    room.is_public,
                    room.password.is_some(),
                )
            })
            .collect();
        
        MessageResult(room_list)
    }
}

impl Handler<CreateRoom> for GameServer {
    type Result = ResponseFuture<Result<String, String>>;

    fn handle(&mut self, msg: CreateRoom, _: &mut Context<Self>) -> Self::Result {
        let room_id = msg.room_id.unwrap_or_else(|| crate::services::create_room::generate_room_id());

        if self.rooms.contains_key(&room_id) {
            return Box::pin(fut::ready(Err("房间ID已存在".to_string())));
        }

        let room = RoomInfo {
            name: msg.name,
            host_player_id: msg.host_id,
            host_player_name: msg.host_name,
            admin_player_id: None, // 初始时无管理员
            admin_player_name: None,
            status: "waiting".to_string(),
            max_players: msg.max_players,
            room_color: msg.room_color,
            players: Vec::new(),
            player_count: 0,
            force_start_players: Vec::new(),
            last_activity: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            password: msg.password,
            is_public: msg.is_public,
            groups: (0..9).map(|i| GroupInfo::new(i)).collect(), // 初始化9个组
            player_groups: HashMap::new(), // 初始化玩家组映射
            // 游戏回合制字段
            game_turn: 0,
            turn_half: true,
            player_actions: HashMap::new(),
            turn_start_time: None,
            // 游戏地图字段
            game_map: None,
            player_teams: HashMap::new(),
        };

        self.rooms.insert(room_id.clone(), room);
        println!("房间 {} 已创建", room_id);

        Box::pin(fut::ready(Ok(room_id)))
    }
}

impl Handler<UserMessage> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: UserMessage, ctx: &mut Context<Self>) {
        match msg {
            UserMessage::Move { room_id: _, sender_id: _, from: _, direction: _ } => {
                // to be constructed
            }
            UserMessage::Chat { room_id, sender_id, username, content } => {
                println!("处理聊天消息: 房间ID={}, 发送者={}, 内容={}", room_id, sender_id, content);
                
                // 更新房间活动时间（除了全局房间）
                if room_id != "global" {
                    self.update_room_activity(&room_id);
                }
                
                if let Some(room) = self.rooms.get(&room_id) {
                    println!("房间 {} 中有 {} 个玩家: {:?}", room_id, room.players.len(), room.players);
                    
                    // 收集要发送消息的玩家，确保每个玩家只收到一次消息
                    let mut recipients_to_send = std::collections::HashSet::new();
                    
                    // 添加当前房间的所有玩家
                    for player_id in &room.players {
                        recipients_to_send.insert(player_id.clone());
                    }
                    
                    // 广播消息给收集到的所有玩家
                    let mut successful_sends = 0;
                    for player_id in recipients_to_send {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            println!("向玩家 {} 发送聊天消息", player_id);
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: sender_id.clone(),
                                username: username.clone(),
                                content: content.clone(),
                            });
                            successful_sends += 1;
                        } else {
                            println!("警告: 找不到玩家 {} 的会话", player_id);
                        }
                    }
                    
                    println!("成功发送聊天消息给 {} 个玩家", successful_sends);
                    
                    // 给发送者发送确认消息（如果发送者不在房间中）
                    if !room.players.contains(&sender_id) {
                        if let Some(recipient) = self.player_sessions.get(&sender_id) {
                            let _ = recipient.do_send(UserMessage::Ok);
                        }
                    }
                } else {
                    println!("警告: 找不到房间 {}", room_id);
                }
            }
            UserMessage::JoinRoomWithName { room_id, player_id, player_name, password } => {
                // 检查玩家是否被踢出该房间且仍在冷却时间内
                if self.is_player_kicked_from_room(&player_id, &room_id) {
                    if let Some(recipient) = self.player_sessions.get(&player_id) {
                        let _ = recipient.do_send(UserMessage::Err("您因被踢出而暂时无法加入此房间，请稍后再试".to_string()));
                        let _ = recipient.do_send(UserMessage::RedirectToHome {
                            reason: "".to_string(),
                        });
                    }
                                    if let Some(room) = self.rooms.get(&room_id) {
                    for other_player_id in &room.players {
                        if let Some(recipient) = self.player_sessions.get(other_player_id) {
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: "system".to_string(),
                                username: "系统".to_string(),
                                content: format!("玩家 {} 尝试加入房间失败", player_id),
                            });
                        }
                    }
                }
                    return;
                }

                // 更新用户名表
                self.user_name_table.insert(player_id.clone(), player_name.clone());
                
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                // 然后执行与JoinRoom相同的逻辑
                // 首先检查用户是否已经在其他房间，如果是则先从旧房间移除（但保留global房间连接）
                let mut old_room_id = None;
                let mut rooms_to_remove_from: Vec<String> = Vec::new();
                for (existing_room_id, room) in self.rooms.iter_mut() {
                    // 跳过global房间和目标房间
                    if existing_room_id != &room_id && existing_room_id != "global" && room.players.contains(&player_id) {
                        room.players.retain(|id| id != &player_id);
                        room.force_start_players.retain(|id| id != &player_id);
                        room.player_count -= 1;
                        rooms_to_remove_from.push(existing_room_id.clone());
                        old_room_id = Some(existing_room_id.clone());
                        
                        // 通知旧房间其他玩家该用户离开了
                        for other_player_id in &room.players {
                            if let Some(recipient) = self.player_sessions.get(other_player_id) {
                                let _ = recipient.do_send(UserMessage::LeaveRoom {
                                    room_id: existing_room_id.clone(),
                                    player_id: player_id.clone(),
                                });
                            }
                        }
                        break;
                    }
                }
                // 处理分组移除，避免双重可变借用
                for remove_room_id in rooms_to_remove_from {
                    self.remove_player_from_groups(&remove_room_id, &player_id);
                }

                // 加入新房间
                let room: &mut RoomInfo = self.rooms.entry(room_id.clone()).or_insert_with(|| RoomInfo {
                    name: format!("房间 #{}", room_id),
                    host_player_id: String::new(),
                    host_player_name: player_name.clone(),
                    admin_player_id: Some(player_id.clone()), // 临时房间初始无管理员
                    admin_player_name: Some(player_name.clone()),
                    status: "waiting".to_string(),
                    max_players: 16, // 默认最大玩家数
                    room_color: "#4F46E5".to_string(), // 默认颜色
                    players: Vec::new(),
                    force_start_players: Vec::new(),
                    player_count: 0,
                    last_activity: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                    password: None,
                    is_public: true, // 临时房间不公开
                    groups: (0..9).map(|i| GroupInfo::new(i)).collect(), // 初始化9个组
                    player_groups: HashMap::new(), // 初始化玩家组映射
                    // 游戏回合制字段
                    game_turn: 0,
                    turn_half: true,
                    player_actions: HashMap::new(),
                    turn_start_time: None,
                    // 游戏地图字段
                    game_map: None,
                    player_teams: HashMap::new(),
                });
                
                if !room.players.contains(&player_id) {
                    // 检查房间是否已满
                    if room.player_count >= room.max_players {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("房间已满".to_string()));
                        }
                        return;
                    }
                    
                    // 检查房间密码
                    if let Some(ref room_password) = room.password {
                        if password.as_deref() != Some(room_password) {
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                // 区分未提供密码和密码错误的情况
                                let error_message = if password.is_none() || password.as_deref() == Some("") {
                                    "需要密码".to_string()
                                } else {
                                    "密码错误".to_string()
                                };
                                let _ = recipient.do_send(UserMessage::Err(error_message));
                            }
                            return;
                        }
                    }
                    
                    room.players.push(player_id.clone());
                    room.player_count += 1;
                    
                    // 自动为新玩家分配组别（内联逻辑避免双重借用）
                    {
                        // 找到人数最少的玩家组（0-7）
                        let mut smallest_group_id = 0u8;
                        let mut smallest_group_size = usize::MAX;
                        
                        for i in 0..8 { // 只考虑玩家组0-7
                            if let Some(group) = room.groups.get(i) {
                                if group.players.len() < smallest_group_size {
                                    smallest_group_size = group.players.len();
                                    smallest_group_id = i as u8;
                                }
                            }
                        }
                        
                        // 如果所有玩家组都满了（假设每组最大2人），则分配到观众组
                        if smallest_group_size >= 2 {
                            smallest_group_id = 8; // 观众组
                        }
                        
                        // 将玩家添加到选定的组
                        if let Some(group) = room.groups.get_mut(smallest_group_id as usize) {
                            group.players.push(player_id.to_string());
                            room.player_groups.insert(player_id.to_string(), smallest_group_id);
                            println!("玩家 {} 被自动分配到组 {} ({})", player_id, smallest_group_id, group.name);
                        }
                    }
                    
                    // 如果这是第一个玩家，设置为房主
                    if room.host_player_id.is_empty() {
                        room.host_player_id = player_id.clone();
                        room.host_player_name = player_name.clone();
                    } else if room.player_count == 1 && room.admin_player_id.is_none() {
                        // 如果房间为空（只有这一个玩家），且没有管理员，自动设为管理员
                        room.admin_player_id = Some(player_id.clone());
                        room.admin_player_name = Some(player_name.clone());
                    }
                    
                    for player in &room.players {
                        if player != &player_id {
                            // 通知其他玩家加入房间
                            if let Some(recipient) = self.player_sessions.get(player) {
                                let _ = recipient.do_send(UserMessage::JoinRoomWithName {
                                    room_id: room_id.clone(),
                                    player_id: player_id.clone(),
                                    player_name: player_name.clone(),
                                    password: None, // 不向其他玩家发送密码
                                });
                            }
                        } else {
                            // 给自己也发一份确认
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::JoinRoomWithName {
                                    room_id: room_id.clone(),
                                    player_id: player_id.clone(),
                                    player_name: player_name.clone(),
                                    password: None, // 不向自己发送密码
                                });
                            }
                        }
                    }
                    
                    // 广播新房间的更新信息
                    if let Some(room_info) = self.get_room_info(&room_id) {
                        self.broadcast_room_info(&room_id, room_info);
                    }
                    
                    // 如果用户从旧房间移除了，也要广播旧房间的更新信息
                    if let Some(old_room) = old_room_id {
                        if let Some(old_room_info) = self.get_room_info(&old_room) {
                            self.broadcast_room_info(&old_room, old_room_info);
                        }
                    }
                }
            }
            UserMessage::LeaveRoom { room_id, player_id } => {
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                // 防止用户离开global房间
                if room_id == "global" {
                    if let Some(recipient) = self.player_sessions.get(&player_id) {
                        let _ = recipient.do_send(UserMessage::Err("无法离开全局聊天房间".to_string()));
                    }
                    return;
                }
                
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    // 从房间中移除玩家
                    if room.players.contains(&player_id) {
                        room.players.retain(|id| id != &player_id);
                        room.force_start_players.retain(|id| id != &player_id); // 确保也从force_start_players中移除
                        room.player_count -= 1;
                        println!("玩家 {} 离开了房间 {}", player_id, room_id);
                        // 从分组中移除玩家（内联逻辑避免双重借用）
                        {
                            // 从玩家组映射中移除
                            if let Some(group_id) = room.player_groups.remove(&player_id) {
                                // 从对应组中移除玩家
                                println!("Removing player {} from group {}", player_id, group_id);
                                if let Some(group) = room.groups.get_mut(group_id as usize) {
                                    group.players.retain(|id| id != &player_id);
                                    println!("玩家 {} 从组 {} ({}) 中移除", player_id, group_id, group.name);
                                }
                            }
                        }

                        // 获取离开玩家的用户名
                        let player_name = self.user_name_table
                            .get(&player_id)
                            .unwrap_or(&"Unknown".to_string())
                            .clone();

                        // 检查离开的是否是管理员
                        let was_admin = room.admin_player_id.as_ref() == Some(&player_id);
                        let was_host = room.host_player_id == player_id;
                        
                        // 如果离开的是管理员，清除管理员信息
                        if was_admin {
                            room.admin_player_id = None;
                            room.admin_player_name = None;
                        }

                        // 向房间内其他玩家广播离开信息
                        for other_player_id in &room.players {
                            if let Some(recipient) = self.player_sessions.get(other_player_id) {
                                let _ = recipient.do_send(UserMessage::LeaveRoom {
                                    room_id: room_id.clone(),
                                    player_id: player_id.clone(),
                                });
                            }
                        }

                        // 如果房主不在且管理员离开了，随机指定新管理员
                        if was_admin && !room.players.contains(&room.host_player_id) && !room.players.is_empty() {
                            // 使用简单的随机选择 - 选择第一个玩家作为新管理员
                            if let Some(new_admin_id) = room.players.first().cloned() {
                                let new_admin_name = self.user_name_table.get(&new_admin_id).cloned();
                                room.admin_player_id = Some(new_admin_id.clone());
                                room.admin_player_name = new_admin_name.clone();
                                
                                // 广播新管理员消息
                                let admin_message = if let Some(name) = &new_admin_name {
                                    format!("{} 已被自动指定为新管理员", name)
                                } else {
                                    "新管理员已自动指定".to_string()
                                };
                                
                                for player_id in &room.players {
                                    if let Some(recipient) = self.player_sessions.get(player_id) {
                                        let _ = recipient.do_send(UserMessage::Chat {
                                            room_id: room_id.clone(),
                                            sender_id: "system".to_string(),
                                            username: "系统".to_string(),
                                            content: admin_message.clone(),
                                        });
                                    }
                                }
                            }
                        }

                        // 给离开的玩家发送确认
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Ok);
                        }

                        // 广播更新后的房间信息
                        if let Some(room_info) = self.get_room_info(&room_id) {
                            self.broadcast_room_info(&room_id, room_info);
                        }
                    }
                }
            }
            UserMessage::ForceStart { room_id, player_id } => {
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    let force_start_n_dict = HashMap::from([
                        (2, 2),
                        (3, 3),
                        (4, 3),
                        (5, 4),
                        (6, 4),
                        (7, 5),
                        (8, 5),
                        (9, 6),
                        (10, 6),
                        (11, 7),
                        (12, 7),
                        (13, 8),
                        (14, 8),
                        (15, 9),
                        (16, 9),
                    ]);
                    if !room.force_start_players.contains(&player_id) {
                        room.force_start_players.push(player_id.clone());
                    } else {
                        // 给请求的玩家发送错误信息
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(
                                UserMessage::Err("You have already requested to start".to_string())
                            );
                        }
                        return;
                    }
                    // 检查是否所有玩家都已准备
                    if room.players.len() > 1 {
                        // 检查是否达到强制开始所需人数
                        if room.force_start_players.len() >= 
                            *force_start_n_dict.get(&room.players.len()).unwrap_or(&room.players.len())
                        {
                            // 发送游戏开始事件
                            for p_id in &room.players {
                                if let Some(recipient) = self.player_sessions.get(p_id) {
                                    let _ = recipient.do_send(UserMessage::StartGame {
                                        room_id: room_id.clone(),
                                    });
                                    let _ = recipient.do_send(UserMessage::Chat {
                                        room_id: room_id.clone(),
                                        sender_id: "system".to_string(),
                                        username: "系统".to_string(),
                                        content: "游戏即将开始！".to_string(),
                                    });
                                }
                            }
                            
                            // 更新房间状态为游戏中，启动回合制系统
                            room.status = "playing".to_string();
                            room.force_start_players.clear();
                            room.game_turn = 1;
                            room.turn_half = true;
                            room.player_actions.clear();
                            room.turn_start_time = Some(std::time::Instant::now());
                            
                            // 初始化游戏地图
                            room.game_map = Some(GameMap::new(5, 5));
                            println!("游戏地图已初始化");
                            
                            // 根据玩家的组别分配队伍ID
                            let mut active_teams = Vec::new();
                            for player_id in &room.players {
                                if let Some(&group_id) = room.player_groups.get(player_id) {
                                    // 组别0-7对应 team_0 到 team_7，观众组8不参与游戏
                                    if group_id < 8 {
                                        let team_id = format!("team_{}", group_id);
                                        room.player_teams.insert(player_id.clone(), team_id.clone());
                                        if !active_teams.contains(&team_id) {
                                            active_teams.push(team_id.clone());
                                        }
                                        println!("队伍分配: {} -> {} (组别: {})", player_id, team_id, group_id);
                                    } else {
                                        println!("玩家 {} 是观众，不参与游戏 (组别: {})", player_id, group_id);
                                    }
                                } else {
                                    println!("警告: 玩家 {} 未分配组别，无法参与游戏", player_id);
                                }
                            }
                            
                            // 为活跃的队伍设置王城位置
                            if let Some(ref mut game_map) = room.game_map {
                                // 预定义的王城位置（可以支持多个队伍）
                                let general_positions = vec![
                                    (0, 4), // 左下角
                                    (4, 0), // 右上角
                                    (0, 0), // 左上角
                                    (4, 4), // 右下角
                                    (2, 0), // 上中
                                    (2, 4), // 下中
                                    (0, 2), // 左中
                                    (4, 2), // 右中
                                ];
                                
                                for (i, team_id) in active_teams.iter().enumerate() {
                                    if i < general_positions.len() {
                                        let (x, y) = general_positions[i];
                                        if let Err(e) = game_map.set_general(x, y, team_id.clone(), 2) {
                                            println!("设置王城失败: {}", e);
                                        } else {
                                            println!("为队伍 {} 在位置 ({}, {}) 设置王城", team_id, x, y);
                                        }
                                    }
                                }
                                
                                if active_teams.len() > general_positions.len() {
                                    println!("警告: 队伍数量 ({}) 超过了预定义的王城位置数量 ({})", 
                                             active_teams.len(), general_positions.len());
                                }
                            }
                            
                            // 向所有玩家发送初始地图数据
                            for p_id in &room.players {
                                if let Some(team_id) = room.player_teams.get(p_id) {
                                    if let Some(ref game_map) = room.game_map {
                                        let visible_tiles = game_map.get_visible_tiles(team_id);
                                        let formatted_tiles: Vec<(usize, usize, String, u8, Option<String>)> = 
                                            visible_tiles.into_iter().map(|(x, y, tile)| {
                                                let (tile_type, count, user_id) = match tile {
                                                    Tile::Wilderness => ("w".to_string(), 0, None),
                                                    Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                                    Tile::Mountain => ("m".to_string(), 0, None),
                                                    Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                                    Tile::Void => ("v".to_string(), 0, None),
                                                };
                                                (x, y, tile_type, count, user_id)
                                            }).collect();
                                        
                                        if let Some(recipient) = self.player_sessions.get(p_id) {
                                            let _ = recipient.do_send(UserMessage::MapUpdate {
                                                room_id: room_id.clone(),
                                                visible_tiles: formatted_tiles,
                                            });
                                        }
                                    }
                                }
                            }
                            
                            // 启动回合制系统：每500ms处理一个半回合
                            let room_id_clone = room_id.clone();
                            ctx.run_later(std::time::Duration::from_millis(500), move |_act, ctx| {
                                ctx.address().do_send(GameTurnMessage {
                                    room_id: room_id_clone,
                                });
                            });
                            
                            // 10秒后（20个回合）结束游戏
                            
                            let room_id_clone2 = room_id.clone();
                            ctx.run_later(std::time::Duration::from_secs(60), move |_act, ctx| {
                                ctx.address().do_send(EndGameMessage {
                                    room_id: room_id_clone2,
                                });
                            });
                        }
                        // 广播更新后的房间信息
                        if let Some(room_info) = self.get_room_info(&room_id) {
                            self.broadcast_room_info(&room_id, room_info);
                        }
                    } else {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(
                                UserMessage::Err("Not enough players to start".to_string())
                            );
                        }
                    }
                }
            }
            UserMessage::DeForceStart { room_id, player_id } => {
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    if room.force_start_players.contains(&player_id) {
                        room.force_start_players.retain(|id| id != &player_id);
                        // 给请求的玩家发送确认
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Ok);
                        }
                        // 广播更新后的房间信息
                        if let Some(room_info) = self.get_room_info(&room_id) {
                            self.broadcast_room_info(&room_id, room_info);
                        }
                    } else {
                        // 给请求的玩家发送错误信息
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(
                                UserMessage::Err("You have not requested to start".to_string())
                            );
                        }
                    }
                }
            }
            UserMessage::SetAdmin { room_id, host_id, target_player_name } => {
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    // 验证请求者是房主
                    if room.host_player_id != host_id {
                        if let Some(recipient) = self.player_sessions.get(&host_id) {
                            let _ = recipient.do_send(UserMessage::Err("只有房主可以设置管理员".to_string()));
                        }
                        return;
                    }
                    
                    // 首先通过用户名查找用户ID
                    let target_player_id = self.user_name_table.iter()
                        .find(|(_, name)| *name == &target_player_name)
                        .map(|(id, _)| id.clone());
                    
                    let target_player_id = match target_player_id {
                        Some(id) => id,
                        None => {
                            if let Some(recipient) = self.player_sessions.get(&host_id) {
                                let _ = recipient.do_send(UserMessage::Err("目标玩家不存在".to_string()));
                            }
                            return;
                        }
                    };
                    
                    // 验证目标玩家在房间内
                    if !room.players.contains(&target_player_id) {
                        if let Some(recipient) = self.player_sessions.get(&host_id) {
                            let _ = recipient.do_send(UserMessage::Err("目标玩家不在房间内".to_string()));
                        }
                        return;
                    }
                    
                    // 设置管理员
                    room.admin_player_id = Some(target_player_id.clone());
                    room.admin_player_name = Some(target_player_name.clone());
                    
                    // 向房主发送确认
                    if let Some(recipient) = self.player_sessions.get(&host_id) {
                        let _ = recipient.do_send(UserMessage::Ok);
                    }
                    
                    // 获取房间玩家列表的克隆，避免借用冲突
                    let room_players = room.players.clone();
                    
                    // 向房间内所有玩家广播管理员设置消息
                    let broadcast_message = format!("{} 被设置为房间管理员", target_player_name);
                    
                    for player_id in &room_players {
                        if let Some(recipient) = self.player_sessions.get(player_id) {
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: "system".to_string(),
                                username: "系统".to_string(),
                                content: broadcast_message.clone(),
                            });
                        }
                    }
                    
                    // 广播房间信息更新
                    if let Some(room_info) = self.get_room_info(&room_id) {
                        self.broadcast_room_info(&room_id, room_info);
                    }
                }
                
                // 在房间借用结束后更新房间活动时间
                self.update_room_activity(&room_id);
            }
            UserMessage::RemoveAdmin { room_id, host_id } => {
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    // 验证请求者是房主
                    if room.host_player_id != host_id {
                        if let Some(recipient) = self.player_sessions.get(&host_id) {
                            let _ = recipient.do_send(UserMessage::Err("只有房主可以撤销管理员权限".to_string()));
                        }
                        return;
                    }
                    
                    // 检查是否有管理员
                    if room.admin_player_id.is_none() {
                        if let Some(recipient) = self.player_sessions.get(&host_id) {
                            let _ = recipient.do_send(UserMessage::Err("当前没有管理员".to_string()));
                        }
                        return;
                    }
                    
                    // 房主不能撤销自己的管理员权限
                    if room.admin_player_id.as_ref() == Some(&host_id) {
                        if let Some(recipient) = self.player_sessions.get(&host_id) {
                            let _ = recipient.do_send(UserMessage::Err("房主不能撤销自己的管理员权限".to_string()));
                        }
                        return;
                    }
                    
                    // 获取当前管理员名称用于广播
                    let admin_name = room.admin_player_name.clone();
                    
                    // 撤销管理员权限
                    room.admin_player_id = None;
                    room.admin_player_name = None;
                    
                    // 向房主发送确认
                    if let Some(recipient) = self.player_sessions.get(&host_id) {
                        let _ = recipient.do_send(UserMessage::Ok);
                    }
                    
                    // 获取房间玩家列表的克隆，避免借用冲突
                    let room_players = room.players.clone();
                    
                    // 向房间内所有玩家广播管理员撤销消息
                    let broadcast_message = if let Some(name) = &admin_name {
                        format!("{} 的管理员权限已被撤销", name)
                    } else {
                        "管理员权限已被撤销".to_string()
                    };
                    
                    for player_id in &room_players {
                        if let Some(recipient) = self.player_sessions.get(player_id) {
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: "system".to_string(),
                                username: "系统".to_string(),
                                content: broadcast_message.clone(),
                            });
                        }
                    }
                    
                    // 广播房间信息更新
                    if let Some(room_info) = self.get_room_info(&room_id) {
                        self.broadcast_room_info(&room_id, room_info);
                    }
                }
                
                // 在房间借用结束后更新房间活动时间
                self.update_room_activity(&room_id);
            }
            UserMessage::KickPlayer { room_id, kicker_id, target_player_name } => {
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    // 首先通过用户名查找用户ID
                    let target_player_id = self.user_name_table.iter()
                        .find(|(_, name)| *name == &target_player_name)
                        .map(|(id, _)| id.clone());
                    
                    let target_player_id = match target_player_id {
                        Some(id) => id,
                        None => {
                            if let Some(recipient) = self.player_sessions.get(&kicker_id) {
                                let _ = recipient.do_send(UserMessage::Err("目标玩家不存在".to_string()));
                            }
                            return;
                        }
                    };
                    
                    // 验证操作者权限（房主或管理员）
                    let is_host = room.host_player_id == kicker_id;
                    let is_admin = room.admin_player_id.as_ref() == Some(&kicker_id);
                    
                    if !is_host && !is_admin {
                        if let Some(recipient) = self.player_sessions.get(&kicker_id) {
                            let _ = recipient.do_send(UserMessage::Err("只有房主或管理员可以踢出玩家".to_string()));
                        }
                        return;
                    }
                    
                    // 验证目标玩家在房间内
                    if !room.players.contains(&target_player_id) {
                        if let Some(recipient) = self.player_sessions.get(&kicker_id) {
                            let _ = recipient.do_send(UserMessage::Err("目标玩家不在房间内".to_string()));
                        }
                        return;
                    }
                    
                    // 不能踢出房主
                    if target_player_id == room.host_player_id {
                        if let Some(recipient) = self.player_sessions.get(&kicker_id) {
                            let _ = recipient.do_send(UserMessage::Err("不能踢出房主".to_string()));
                        }
                        return;
                    }
                    
                    // 管理员不能踢出房主
                    if is_admin && target_player_id == room.host_player_id {
                        if let Some(recipient) = self.player_sessions.get(&kicker_id) {
                            let _ = recipient.do_send(UserMessage::Err("管理员不能踢出房主".to_string()));
                        }
                        return;
                    }
                    
                    // 获取目标玩家名称用于广播（我们已经有了target_player_name）
                    let kicker_name = self.user_name_table.get(&kicker_id).cloned();
                    
                    // 记录被踢出的玩家和时间到特定房间
                    self.kicked_players
                        .entry(room_id.clone())
                        .or_insert_with(HashMap::new)
                        .insert(target_player_id.clone(), Self::current_timestamp());
                    
                    // 移除玩家
                    room.players.retain(|id| id != &target_player_id);
                    room.player_count -= 1;
                    
                    // 如果被踢出的是管理员，清除管理员信息
                    if room.admin_player_id.as_ref() == Some(&target_player_id) {
                        room.admin_player_id = None;
                        room.admin_player_name = None;
                    }
                    
                    // 从用户名表中移除（这样玩家就不在房间中了，但仍保持WebSocket连接）
                    // 注意：我们不从 player_sessions 中移除，这样玩家可以收到重定向消息
                    
                    // 向被踢出的玩家发送特殊提示和重定向指令
                    if let Some(recipient) = self.player_sessions.get(&target_player_id) {
                        let kick_message = format!("您已被{}踢出房间，5分钟内无法加入此房间", 
                            kicker_name.as_deref().unwrap_or("管理员"));
                        let _ = recipient.do_send(UserMessage::Err(kick_message));
                        
                        // 发送重定向到首页的消息
                        let _ = recipient.do_send(UserMessage::RedirectToHome {
                            reason: "kicked_from_room".to_string(),
                        });
                        
                        // 同时发送离开房间消息
                        let _ = recipient.do_send(UserMessage::LeaveRoom {
                            room_id: room_id.clone(),
                            player_id: target_player_id.clone(),
                        });
                    }
                    
                    // 向操作者发送确认
                    if let Some(recipient) = self.player_sessions.get(&kicker_id) {
                        let _ = recipient.do_send(UserMessage::Ok);
                    }
                    
                    // 获取房间玩家列表的克隆，避免借用冲突
                    let room_players = room.players.clone();
                    let room_name = room.name.clone();
                    
                    // 向房间内所有玩家广播踢出消息
                    let room_broadcast_message = match &kicker_name {
                        Some(op_name) => format!("{} 被 {} 踢出房间", target_player_name, op_name),
                        None => format!("{} 被踢出房间", target_player_name),
                    };
                    
                    for player_id in &room_players {
                        if let Some(recipient) = self.player_sessions.get(player_id) {
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: "system".to_string(),
                                username: "系统".to_string(),
                                content: room_broadcast_message.clone(),
                            });
                        }
                    }
                    
                    // 向所有在线玩家广播踢出通知
                    let global_broadcast_message = match &kicker_name {
                        Some(op_name) => {
                            format!("玩家 {} 在房间「{}」中被 {} 踢出", target_player_name, room_name, op_name)
                        },
                        None => {
                            format!("玩家 {} 在房间「{}」中被踢出", target_player_name, room_name)
                        },
                    };
                    
                    self.broadcast_to_all_players(&global_broadcast_message);
                    
                    // 广播房间信息更新
                    if let Some(room_info) = self.get_room_info(&room_id) {
                        self.broadcast_room_info(&room_id, room_info);
                    }
                }
                
                // 检查房间是否为空并删除
                if let Some(room) = self.rooms.get(&room_id) {
                    if room.players.is_empty() {
                        self.rooms.remove(&room_id);
                    }
                }
                
                // 在房间借用结束后更新房间活动时间
                self.update_room_activity(&room_id);
            }
            UserMessage::ChangeGroup { room_id, player_id, target_group_id } => {
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                // 验证玩家是否在房间中
                if let Some(room) = self.rooms.get(&room_id) {
                    if !room.players.contains(&player_id) {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("您不在此房间中".to_string()));
                        }
                        return;
                    }
                } else {
                    if let Some(recipient) = self.player_sessions.get(&player_id) {
                        let _ = recipient.do_send(UserMessage::Err("房间不存在".to_string()));
                    }
                    return;
                }
                
                // 尝试切换组别
                match self.change_player_group(&room_id, &player_id, target_group_id) {
                    Ok(()) => {
                        // 向玩家发送成功确认
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Ok);
                        }
                        
                        // 获取用户名和组名用于广播
                        let player_name = self.user_name_table
                            .get(&player_id)
                            .unwrap_or(&"Unknown".to_string())
                            .clone();
                        
                        let group_name = if let Some(room) = self.rooms.get(&room_id) {
                            if let Some(group) = room.groups.get(target_group_id as usize) {
                                group.name.clone()
                            } else {
                                "未知组".to_string()
                            }
                        } else {
                            "未知组".to_string()
                        };
                        
                        // 向房间内所有玩家广播组别变更消息
                        if let Some(room) = self.rooms.get(&room_id) {
                            let change_message = format!("{} 切换到了 {}", player_name, group_name);
                            for room_player_id in &room.players {
                                if let Some(recipient) = self.player_sessions.get(room_player_id) {
                                    let _ = recipient.do_send(UserMessage::Chat {
                                        room_id: room_id.clone(),
                                        sender_id: "system".to_string(),
                                        username: "系统".to_string(),
                                        content: change_message.clone(),
                                    });
                                }
                            }
                        }
                        
                        // 广播房间信息更新
                        if let Some(room_info) = self.get_room_info(&room_id) {
                            self.broadcast_room_info(&room_id, room_info);
                        }
                    }
                    Err(error_msg) => {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err(error_msg));
                        }
                    }
                }
            }
            UserMessage::GameAction { room_id, player_id, action } => {
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    // 验证玩家在房间中且游戏正在进行
                    if !room.players.contains(&player_id) {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("您不在此房间中".to_string()));
                        }
                        return;
                    }
                    
                    if room.status != "playing" {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("游戏未在进行中".to_string()));
                        }
                        return;
                    }
                    
                    // 记录玩家动作（覆盖之前的动作）
                    room.player_actions.insert(player_id.clone(), action);
                    
                    // 向玩家发送确认
                    if let Some(recipient) = self.player_sessions.get(&player_id) {
                        let _ = recipient.do_send(UserMessage::Ok);
                    }
                }
            }
            UserMessage::GameMove { room_id, player_id, from_x, from_y, to_x, to_y } => {
                println!("收到GameMove消息: 房间={}, 玩家={}, ({},{}) -> ({},{})", 
                         room_id, player_id, from_x, from_y, to_x, to_y);
                
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                if let Some(room) = self.rooms.get_mut(&room_id) {
                    // 验证玩家在房间中且游戏正在进行
                    if !room.players.contains(&player_id) {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("您不在此房间中".to_string()));
                        }
                        return;
                    }
                    
                    if room.status != "playing" {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("游戏未在进行中".to_string()));
                        }
                        return;
                    }
                    
                    // 获取玩家队伍
                    let team_id = match room.player_teams.get(&player_id) {
                        Some(id) => {
                            println!("玩家 {} 所属队伍: {}", player_id, id);
                            id.clone()
                        },
                        None => {
                            println!("错误: 玩家 {} 未分配队伍", player_id);
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::Err("您未分配队伍".to_string()));
                            }
                            return;
                        }
                    };
                    
                    // 立即执行移动操作
                    if let Some(ref mut game_map) = room.game_map {
                        match game_map.execute_move(from_x, from_y, to_x, to_y, &team_id) {
                            Ok(Some(winner_team)) => {
                                // 有玩家获胜，游戏结束
                                println!("玩家 {} (队伍: {}) 成功执行移动并获胜: ({},{}) -> ({},{})", 
                                         player_id, team_id, from_x, from_y, to_x, to_y);
                                
                                // 更新房间状态
                                room.status = "finished".to_string();
                                
                                // 向所有玩家发送游戏胜利消息
                                for p_id in &room.players {
                                    if let Some(recipient) = self.player_sessions.get(p_id) {
                                        let _ = recipient.do_send(UserMessage::GameWin {
                                            room_id: room_id.clone(),
                                            winner: winner_team.clone(),
                                        });
                                    }
                                }
                                
                                // 向操作玩家发送成功确认
                                if let Some(recipient) = self.player_sessions.get(&player_id) {
                                    let _ = recipient.do_send(UserMessage::Ok);
                                }
                            }
                            Ok(None) => {
                                // 移动成功，游戏继续
                                println!("玩家 {} (队伍: {}) 成功执行移动: ({},{}) -> ({},{})", 
                                         player_id, team_id, from_x, from_y, to_x, to_y);
                                
                                // 向玩家发送成功确认
                                if let Some(recipient) = self.player_sessions.get(&player_id) {
                                    let _ = recipient.do_send(UserMessage::Ok);
                                }
                            }
                            Err(error_msg) => {
                                println!("玩家 {} (队伍: {}) 移动失败: ({},{}) -> ({},{}) - {}", 
                                         player_id, team_id, from_x, from_y, to_x, to_y, error_msg);
                                
                                // 向玩家发送错误信息
                                if let Some(recipient) = self.player_sessions.get(&player_id) {
                                    let _ = recipient.do_send(UserMessage::Err(error_msg));
                                }
                                return; // 移动失败，不发送地图更新
                            }
                        }
                    } else {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(UserMessage::Err("游戏地图未初始化".to_string()));
                        }
                        return;
                    }
                    
                    // 向房间内所有玩家广播地图更新
                    println!("广播地图更新给房间 {} 的所有玩家", room_id);
                    for p_id in &room.players {
                        if let Some(team_id) = room.player_teams.get(p_id) {
                            if let Some(ref game_map) = room.game_map {
                                let visible_tiles = game_map.get_visible_tiles(team_id);
                                println!("玩家 {} (队伍: {}) 可见格子数: {}", p_id, team_id, visible_tiles.len());
                                let formatted_tiles: Vec<(usize, usize, String, u8, Option<String>)> = 
                                    visible_tiles.into_iter().map(|(x, y, tile)| {
                                        let (tile_type, count, user_id) = match tile {
                                            Tile::Wilderness => ("w".to_string(), 0, None),
                                            Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                            Tile::Mountain => ("m".to_string(), 0, None),
                                            Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                            Tile::Void => ("v".to_string(), 0, None),
                                        };
                                        (x, y, tile_type, count, user_id)
                                    }).collect();
                                
                                if let Some(recipient) = self.player_sessions.get(p_id) {
                                    let _ = recipient.do_send(UserMessage::MapUpdate {
                                        room_id: room_id.clone(),
                                        visible_tiles: formatted_tiles,
                                    });
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

pub fn create_game_server() -> Addr<GameServer> {
    GameServer::default().start()
}

// 全局WebSocket会话，不绑定特定房间
pub struct GlobalUserSession {
    user_id: String,
    username: String,
    addr: Addr<GameServer>,
}

impl GlobalUserSession {
    pub fn new(user_id: String, username: String, addr: Addr<GameServer>) -> Self {
        Self {
            user_id,
            username,
            addr,
        }
    }

    fn handle_join_room(&mut self, room_id: &str, player_name: &str, password: &Option<String>, ctx: &mut ws::WebsocketContext<Self>) {
        let room_id = room_id.to_string();
        let player_name = player_name.to_string();
        let password = password.clone();
        let player_id = self.user_id.clone();
        
        self.addr
            .send(UserMessage::JoinRoomWithName {
                room_id: room_id.clone(),
                player_id,
                player_name: player_name.clone(),
                password,
            })
            .into_actor(self)
            .then(move |res, _act, ctx| {
                match res {
                    Ok(()) => {
                        let response = serde_json::json!({
                            "type": "join_room_success",
                            "room_id": room_id,
                            "message": "成功加入房间"
                        });
                        ctx.text(response.to_string());
                    }
                    Err(_) => {
                        let response = serde_json::json!({
                            "type": "join_room_error",
                            "room_id": room_id, 
                            "error": "服务器内部错误"
                        });
                        ctx.text(response.to_string());
                    }
                }
                fut::ready(())
            })
            .wait(ctx);
    }
}

impl Actor for GlobalUserSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let addr: Addr<GlobalUserSession> = ctx.address();
        let user_id = self.user_id.clone();
        let username = self.username.clone();
        
        self.addr
            .send(Connect {
                user_id: user_id.clone(),
                username: username.clone(),
                recipient: addr.recipient(),
            })
            .into_actor(self)
            .then(move |res, _act, ctx| {
                match res {
                    Ok(Ok(())) => {
                        println!("全局WebSocket会话建立成功，用户ID: {}, 用户名: {}", user_id, username);
                        
                        // 发送连接成功消息
                        let response = serde_json::json!({
                            "type": "connected",
                            "user_id": user_id,
                            "username": username
                        });
                        ctx.text(response.to_string());
                    }
                    Ok(Err(error)) => {
                        println!("用户连接失败: {}", error);
                        let error_response = serde_json::json!({
                            "type": "error",
                            "message": error
                        });
                        ctx.text(error_response.to_string());
                        ctx.stop();
                    }
                    Err(_) => {
                        println!("连接到GameServer失败");
                        ctx.stop();
                    }
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn stopped(&mut self, _: &mut Self::Context) {
        self.addr.do_send(Disconnect { player_id: self.user_id.clone() });
    }
}

impl Handler<UserMessage> for GlobalUserSession {
    type Result = ();

    fn handle(&mut self, msg: UserMessage, ctx: &mut Self::Context) {
        match msg {
            UserMessage::Chat { room_id, sender_id, username, content } => {
                let chat_json = serde_json::json!({
                    "type": "chat_message",
                    "room_id": room_id,
                    "user_id": sender_id.to_string(),
                    "username": username,
                    "message": content,
                    "content": content, // 同时提供 content 字段以兼容前端
                });
                println!("GlobalUserSession 向客户端发送聊天消息: {}", chat_json);
                ctx.text(chat_json.to_string());
            }
            UserMessage::JoinRoomWithName { room_id, player_id, player_name, password: _ } => {
                let join_json = serde_json::json!({
                    "type": "join_room",
                    "room_id": room_id,
                    "player_id": player_id,
                    "player_name": player_name,
                });
                ctx.text(join_json.to_string());
            }
            UserMessage::LeaveRoom { room_id, player_id } => {
                let leave_json = serde_json::json!({
                    "type": "leave_room",
                    "room_id": room_id,
                    "player_id": player_id,
                });
                ctx.text(leave_json.to_string());
            }
            UserMessage::RoomInfoUpdate(room_info) => {
                // 手动构建分组JSON数组，只传递ID和玩家列表
                let groups_json: Vec<serde_json::Value> = room_info.groups
                    .iter()
                    .map(|group| serde_json::json!({
                        "id": group.id,
                        "players": group.players
                    }))
                    .collect();

                let room_info_json = serde_json::json!({
                    "type": "room_info",
                    "name": room_info.name,
                    "host_player_name": room_info.host_player_name,
                    "admin_player_name": room_info.admin_player_name,
                    "status": room_info.status,
                    "players": room_info.players,
                    "player_count": room_info.player_count,
                    "force_start_players": room_info.force_start_players,
                    "required_to_start": room_info.required_to_start,
                    "groups": groups_json,
                    "room_id": room_info.room_id,
                    "max_players": room_info.max_players,
                });
                println!("GlobalUserSession 发送房间信息更新: {}", room_info_json);
                ctx.text(room_info_json.to_string());
            }
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
            UserMessage::RedirectToHome { reason } => {
                let redirect_json = serde_json::json!({
                    "type": "redirect_to_home",
                    "reason": reason,
                });
                ctx.text(redirect_json.to_string());
            }
            UserMessage::StartGame { room_id } => {
                let start_game_json = serde_json::json!({
                    "type": "start_game",
                    "room_id": room_id,
                });
                println!("GlobalUserSession 发送游戏开始消息: {}", start_game_json);
                ctx.text(start_game_json.to_string());
            }
            UserMessage::EndGame { room_id } => {
                let end_game_json = serde_json::json!({
                    "type": "end_game",
                    "room_id": room_id,
                });
                println!("GlobalUserSession 发送游戏结束消息: {}", end_game_json);
                ctx.text(end_game_json.to_string());
            }
            UserMessage::GameTurnUpdate { room_id, turn, turn_half, actions } => {
                let turn_update_json = serde_json::json!({
                    "type": "game_turn_update",
                    "room_id": room_id,
                    "turn": turn,
                    "turn_half": turn_half,
                    "actions": actions,
                });
                println!("GlobalUserSession 发送回合更新消息: {}", turn_update_json);
                ctx.text(turn_update_json.to_string());
            }
            UserMessage::MapUpdate { room_id, visible_tiles } => {
                let map_update_json = serde_json::json!({
                    "type": "map_update",
                    "room_id": room_id,
                    "visible_tiles": visible_tiles,
                });
                println!("GlobalUserSession 发送地图更新消息: {}", map_update_json);
                ctx.text(map_update_json.to_string());
            }
            UserMessage::GameWin { room_id, winner } => {
                let game_win_json = serde_json::json!({
                    "type": "game_win",
                    "room_id": room_id,
                    "winner": winner,
                });
                println!("GlobalUserSession 发送游戏胜利消息: {}", game_win_json);
                ctx.text(game_win_json.to_string());
            }
            _ => {}
        }
    }
}

impl Handler<ReturnedRoomInfo> for GlobalUserSession {
    type Result = ();

    fn handle(&mut self, msg: ReturnedRoomInfo, ctx: &mut Self::Context) {
        // 手动构建分组JSON数组，只传递ID和玩家列表
        let groups_json: Vec<serde_json::Value> = msg.groups
            .iter()
            .map(|group| serde_json::json!({
                "id": group.id,
                "players": group.players
            }))
            .collect();

        let room_info_json = serde_json::json!({
            "type": "room_info",
            "name": msg.name,
            "host_player_name": msg.host_player_name,
            "admin_player_name": msg.admin_player_name,
            "status": msg.status,
            "players": msg.players,
            "player_count": msg.player_count,
            "force_start_players": msg.force_start_players,
            "required_to_start": msg.required_to_start,
            "groups": groups_json,
            "room_id": msg.room_id,
            "max_players": msg.max_players,
        });
        println!("GlobalUserSession 发送获取的房间信息: {}", room_info_json);
        ctx.text(room_info_json.to_string());
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for GlobalUserSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Text(text)) => {
                println!("收到全局WebSocket消息从用户 {}: {}", self.user_id, text);
                
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(msg_type) = json["type"].as_str() {
                        println!("解析消息类型: {}", msg_type);
                        match msg_type {
                            "join_room" => {
                                if let (Some(room_id), Some(player_name)) = (
                                    json.get("room_id").and_then(|v| v.as_str()),
                                    json.get("player_name").and_then(|v| v.as_str()),
                            ) {
                                if player_name == &self.username {
                                    let password = json.get("password").and_then(|v| v.as_str()).map(String::from);
                                    self.handle_join_room(room_id, player_name, &password, ctx);
                                } else {
                                    println!("警告: 用户名不匹配，忽略加入房间请求。");
                                }
                            }
                            }
                            "leave_room" => {
                                if let Some(room_id) = json["room_id"].as_str() {
                                    self.addr.do_send(UserMessage::LeaveRoom {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                    });
                                }
                            }
                            "chat" | "chat_message" => {
                                if let (Some(room_id), Some(content)) = (
                                    json["room_id"].as_str(),
                                    json["message"].as_str().or(json["content"].as_str())
                                ) {
                                    println!("GlobalUserSession 发送聊天消息: 房间={}, 用户={}, 内容={}", room_id, self.user_id, content);
                                    self.addr.do_send(UserMessage::Chat {
                                        room_id: room_id.to_string(),
                                        sender_id: self.user_id.clone(),
                                        username: self.username.clone(),
                                        content: content.to_string(),
                                    });
                                }
                            }
                            "get_room_info" => {
                                if let Some(room_id) = json["room_id"].as_str() {
                                    let game_server_addr = self.addr.clone();
                                    let ctx_addr = ctx.address();
                                    let room_id = room_id.to_string();
                                    
                                    let fut = async move {
                                        match game_server_addr.send(GetRoomInfo {
                                            room_id: room_id.clone(),
                                        }).await {
                                            Ok(room_info) => {
                                                ctx_addr.do_send(room_info);
                                            }
                                            Err(_) => {
                                                println!("获取房间信息失败: {}", room_id);
                                            }
                                        }
                                    };
                                    
                                    Arbiter::current().spawn(fut);
                                }
                            }
                            "force_start" => {
                                if let Some(room_id) = json["room_id"].as_str() {
                                    self.addr.do_send(UserMessage::ForceStart {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                    });
                                }
                            }
                            "de_force_start" => {
                                if let Some(room_id) = json["room_id"].as_str() {
                                    self.addr.do_send(UserMessage::DeForceStart {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                    });
                                }
                            }
                            "game_action" => {
                                if let (Some(room_id), Some(action)) = (
                                    json["room_id"].as_str(),
                                    json["action"].as_str()
                                ) {
                                    self.addr.do_send(UserMessage::GameAction {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                        action: action.to_string(),
                                    });
                                }
                            }
                            "game_move" => {
                                println!("解析game_move消息: {}", text);
                                if let (
                                    Some(room_id),
                                    Some(from_x),
                                    Some(from_y),
                                    Some(to_x),
                                    Some(to_y)
                                ) = (
                                    json["room_id"].as_str(),
                                    json["from_x"].as_u64(),
                                    json["from_y"].as_u64(),
                                    json["to_x"].as_u64(),
                                    json["to_y"].as_u64()
                                ) {
                                    println!("向GameServer发送GameMove: room_id={}, from=({},{}), to=({},{})", 
                                             room_id, from_x, from_y, to_x, to_y);
                                    self.addr.do_send(UserMessage::GameMove {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                        from_x: from_x as usize,
                                        from_y: from_y as usize,
                                        to_x: to_x as usize,
                                        to_y: to_y as usize,
                                    });
                                } else {
                                    println!("game_move消息解析失败: room_id={:?}, from_x={:?}, from_y={:?}, to_x={:?}, to_y={:?}",
                                             json["room_id"].as_str(),
                                             json["from_x"].as_u64(),
                                             json["from_y"].as_u64(),
                                             json["to_x"].as_u64(),
                                             json["to_y"].as_u64());
                                }
                            }
                            "set_admin" => {
                                if let (Some(room_id), Some(target_player_name)) = (
                                    json["room_id"].as_str(),
                                    json["target_player_name"].as_str()
                                ) {
                                    self.addr.do_send(UserMessage::SetAdmin {
                                        room_id: room_id.to_string(),
                                        host_id: self.user_id.clone(),
                                        target_player_name: target_player_name.to_string(),
                                    });
                                }
                            }
                            "remove_admin" => {
                                if let Some(room_id) = json["room_id"].as_str() {
                                    self.addr.do_send(UserMessage::RemoveAdmin {
                                        room_id: room_id.to_string(),
                                        host_id: self.user_id.clone(),
                                    });
                                }
                            }
                            "kick_player" => {
                                if let (Some(room_id), Some(target_player_name)) = (
                                    json["room_id"].as_str(),
                                    json["target_player_name"].as_str()
                                ) {
                                    self.addr.do_send(UserMessage::KickPlayer {
                                        room_id: room_id.to_string(),
                                        kicker_id: self.user_id.clone(),
                                        target_player_name: target_player_name.to_string(),
                                    });
                                }
                            }
                            "change_group" => {
                                if let (Some(room_id), Some(target_group_id)) = (
                                    json["room_id"].as_str(),
                                    json["target_group_id"].as_u64()
                                ) {
                                    self.addr.do_send(UserMessage::ChangeGroup {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                        target_group_id: target_group_id as u8,
                                    });
                                }
                            }
                            _ => {
                                println!("未知的消息类型: {}", msg_type);
                            }
                        }
                    } else {
                        println!("消息缺少type字段: {}", text);
                    }
                } else {
                    println!("JSON解析失败: {}", text);
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

// 全局WebSocket处理器
pub async fn global_websocket_handler(
    req: HttpRequest,
    stream: web::Payload,
    game_server: web::Data<Addr<GameServer>>,
) -> Result<HttpResponse, actix_web::Error> {
    println!("新的全局WebSocket连接建立");
    
    // 从查询参数中获取用户信息
    let query_string = req.query_string();
    let query = web::Query::<HashMap<String, String>>::from_query(query_string)
        .unwrap_or_else(|_| web::Query(HashMap::new()));
    
    let user_id = match query.get("user_id") {
        Some(id) if !id.is_empty() => id.clone(),
        _ => {
            println!("缺少必要的user_id参数");
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Missing user_id parameter"
            })));
        }
    };
    
    let username = match query.get("username") {
        Some(name) if !name.is_empty() => name.clone(),
        _ => {
            println!("缺少必要的username参数");
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Missing username parameter"
            })));
        }
    };
    
    println!("创建全局WebSocket会话，用户ID: {}, 用户名: {}", user_id, username);
    
    let global_session = GlobalUserSession::new(user_id, username, game_server.get_ref().clone());
    ws::start(global_session, &req, stream)
}

impl Handler<GameTurnMessage> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: GameTurnMessage, ctx: &mut Context<Self>) {
        if let Some(room) = self.rooms.get_mut(&msg.room_id) {
            if room.status != "playing" {
                return; // 游戏已结束，不再处理回合
            }
            
            // 处理回合逻辑
            if let Some(ref mut game_map) = room.game_map {
                // 1. 首先处理兵力增长（每个半回合都要检查）
                if room.turn_half {
                    // 每半秒（每个回合的下半秒）所有玩家王城兵力增加1
                    println!("回合 {} - 增加王城兵力", room.game_turn);
                    game_map.increase_general_troops();
                }
                
                // 每25个回合（25turn）所有玩家所有t和g兵力增加1
                if room.game_turn % 25 == 0 && room.turn_half {
                    println!("回合 {} - 增加所有兵力", room.game_turn);
                    game_map.increase_all_troops();
                }
                
                // 2. 处理玩家移动事件
                // 获取排序后的玩家列表
                let mut sorted_players = room.players.clone();
                if room.turn_half {
                    // 前半秒：玩家在roomInfo顺序从小到大
                    // 已经是原顺序，不需要额外处理
                } else {
                    // 后半秒：从大到小
                    sorted_players.reverse();
                }
                
                // 按顺序处理每个玩家的移动事件
                for player_id in &sorted_players {
                    if let Some(team_id) = room.player_teams.get(player_id) {
                        // 检查玩家是否有待处理的移动事件（这里需要从前端或队列中获取）
                        // 注意：当前系统中移动是立即处理的，所以这里暂时不需要额外处理
                        // 如果需要实现移动队列，需要在GameMove中将移动事件存储到队列而不是立即执行
                    }
                }
                
                // 3. 向所有玩家广播地图更新和回合信息
                for player_id in &room.players {
                    if let Some(team_id) = room.player_teams.get(player_id) {
                        let visible_tiles = game_map.get_visible_tiles(team_id);
                        let formatted_tiles: Vec<(usize, usize, String, u8, Option<String>)> = 
                            visible_tiles.into_iter().map(|(x, y, tile)| {
                                let (tile_type, count, user_id) = match tile {
                                    Tile::Wilderness => ("w".to_string(), 0, None),
                                    Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                    Tile::Mountain => ("m".to_string(), 0, None),
                                    Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                    Tile::Void => ("v".to_string(), 0, None),
                                };
                                (x, y, tile_type, count, user_id)
                            }).collect();
                        
                        if let Some(recipient) = self.player_sessions.get(player_id) {
                            let _ = recipient.do_send(UserMessage::MapUpdate {
                                room_id: msg.room_id.clone(),
                                visible_tiles: formatted_tiles,
                            });
                        }
                    }
                }
            }
            
            // 收集当前半回合信息用于显示
            let mut turn_actions = Vec::new();
            for player_id in &room.players {
                let player_name = self.user_name_table
                    .get(player_id)
                    .unwrap_or(&"Unknown".to_string())
                    .clone();
                
                // 显示玩家在当前回合的动作
                let action_info = if let Some(action) = room.player_actions.get(player_id) {
                    action.clone()
                } else {
                    "等待指令".to_string()
                };
                turn_actions.push((player_name, action_info));
            }
            
            // 广播回合更新给房间内所有玩家
            for player_id in &room.players {
                if let Some(recipient) = self.player_sessions.get(player_id) {
                    let _ = recipient.do_send(UserMessage::GameTurnUpdate {
                        room_id: msg.room_id.clone(),
                        turn: room.game_turn,
                        turn_half: room.turn_half,
                        actions: turn_actions.clone(),
                    });
                }
            }
            
            // 更新回合状态
            if room.turn_half {
                // 从上半回合转到下半回合
                room.turn_half = false;
            } else {
                // 从下半回合转到下一个完整回合
                room.turn_half = true;
                room.game_turn += 1;
            }
            
            // 继续下一个半回合（如果游戏还在进行）
            if room.status == "playing" {
                let room_id_clone = msg.room_id.clone();
                ctx.run_later(std::time::Duration::from_millis(500), move |_act, ctx| {
                    ctx.address().do_send(GameTurnMessage {
                        room_id: room_id_clone,
                    });
                });
            }
        }
    }
}

impl Handler<EndGameMessage> for GameServer {
    type Result = ();

    fn handle(&mut self, msg: EndGameMessage, _: &mut Context<Self>) {
        if let Some(room) = self.rooms.get_mut(&msg.room_id) {
            // 更新房间状态为等待
            room.status = "waiting".to_string();
            
            // 向房间内所有玩家发送游戏结束事件
            for player_id in &room.players {
                if let Some(recipient) = self.player_sessions.get(player_id) {
                    let _ = recipient.do_send(UserMessage::EndGame {
                        room_id: msg.room_id.clone(),
                    });
                    let _ = recipient.do_send(UserMessage::Chat {
                        room_id: msg.room_id.clone(),
                        sender_id: "system".to_string(),
                        username: "系统".to_string(),
                        content: "游戏结束！".to_string(),
                    });
                }
            }
            
            // 广播更新后的房间信息
            if let Some(room_info) = self.get_room_info(&msg.room_id) {
                self.broadcast_room_info(&msg.room_id, room_info);
            }
        }
    }
}

impl Handler<CleanupInactiveRooms> for GameServer {
    type Result = ();

    fn handle(&mut self, _msg: CleanupInactiveRooms, _: &mut Context<Self>) {
        let current_time = Self::current_timestamp();
        let one_hour = 60 * 60; // 1小时 = 3600秒
        let kick_cooldown = 300; // 5分钟踢出冷却
        
        let mut rooms_to_remove = Vec::new();
        let mut rooms_to_update = Vec::new();
        
        // 清理已断开连接但仍在房间中的玩家
        for (room_id, room) in &mut self.rooms {
            let mut players_to_remove = Vec::new();
            
            for player_id in &room.players {
                // 如果玩家不在活跃会话中，说明已经断开连接
                if !self.player_sessions.contains_key(player_id) {
                    players_to_remove.push(player_id.clone());
                }
            }
            
            // 移除已断开连接的玩家
            if !players_to_remove.is_empty() {
                for player_id in &players_to_remove {
                    room.players.retain(|id| id != player_id);
                    room.force_start_players.retain(|id| id != player_id);
                    room.player_count = room.players.len();
                    self.user_name_table.remove(player_id);
                    println!("清理已断开连接的玩家: {} 从房间: {}", player_id, room_id);
                }
                rooms_to_update.push(room_id.clone());
            }
        }
        
        // 更新有变化的房间
        for room_id in &rooms_to_update {
            if let Some(room_info) = self.get_room_info(room_id) {
                self.broadcast_room_info(room_id, room_info);
            }
        }
        
        for (room_id, room) in &self.rooms {
            // 跳过全局房间，全局房间永不删除
            if room_id == "global" {
                continue;
            }
            
            // 如果房间为空且超过1小时没有活动，标记为删除
            if room.player_count == 0 && (current_time - room.last_activity) > one_hour {
                rooms_to_remove.push(room_id.clone());
            }
        }
        
        // 删除过期房间
        for room_id in rooms_to_remove {
            println!("删除空闲房间: {}", room_id);
            self.rooms.remove(&room_id);
        }
        
        // 清理过期的踢出记录
        let mut rooms_to_clean = Vec::new();
        for (room_id, room_kicks) in &mut self.kicked_players {
            let mut expired_kicks = Vec::new();
            for (player_id, kick_time) in room_kicks.iter() {
                if current_time - kick_time > kick_cooldown {
                    expired_kicks.push(player_id.clone());
                }
            }
            
            for player_id in expired_kicks {
                room_kicks.remove(&player_id);
                println!("清理过期踢出记录: 房间 {} 玩家 {}", room_id, player_id);
            }
            
            // 如果房间没有踢出记录了，标记为清理
            if room_kicks.is_empty() {
                rooms_to_clean.push(room_id.clone());
            }
        }
        
        // 移除空的房间踢出记录
        for room_id in rooms_to_clean {
            self.kicked_players.remove(&room_id);
        }
    }
}

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use actix::prelude::*;
use actix::fut;
use actix_web::{ web, HttpRequest, HttpResponse };
use actix_web_actors::ws;
use serde_json;
use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
type Coordinate = (i32, i32);

#[derive(Clone, Debug, PartialEq)]
enum Tile {
    Wilderness,                           // w: 无主之地
    Territory { count: usize, user_id: String }, // t: 玩家领地，兵力count，玩家user_id
    Mountain,                            // m: 山（暂未使用）
    General { count: usize, user_id: String }, // g: 王城，兵力count，玩家user_id
    Void,                               // v: 占位符，空白（暂未使用）
    City { count: usize, user_id: Option<String>, city_type: CityType }, // c: 城市，兵力count，拥有者user_id（可为空），城市类型
}

#[derive(Clone, Debug, PartialEq)]
enum CityType {
    Settlement,  // 定居点
    SmallCity,   // 小型城市  
    LargeCity,   // 大型城市
}

impl Tile {
    fn get_count(&self) -> usize {
        match self {
            Tile::Territory { count, .. } => *count,
            Tile::General { count, .. } => *count,
            Tile::City { count, .. } => *count,
            _ => 0,
        }
    }
    
    fn get_user_id(&self) -> Option<&String> {
        match self {
            Tile::Territory { user_id, .. } => Some(user_id),
            Tile::General { user_id, .. } => Some(user_id),
            Tile::City { user_id: Some(user_id), .. } => Some(user_id),
            _ => None,
        }
    }
    
    fn set_count(&mut self, new_count: usize) {
        match self {
            Tile::Territory { count, .. } => *count = new_count,
            Tile::General { count, .. } => *count = new_count,
            Tile::City { count, .. } => *count = new_count,
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
        // 这个方法现在已被new_random替代，仅保留用于测试
        // 创建基础地图，所有位置初始为荒野
        let tiles = vec![vec![Tile::Wilderness; width]; height];
        Self { tiles, width, height }
    }

    // 生成随机地图，根据玩家数量调整地图大小和内容
    fn new_random(player_count: usize) -> Self {
        // 使用当前时间戳作为seed，确保每次游戏都不同
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        
        Self::new_random_with_seed(player_count, seed)
    }
    
    // 使用指定seed生成随机地图（用于测试和复现）
    fn new_random_with_seed(player_count: usize, seed: u64) -> Self {
        let mut rng = StdRng::seed_from_u64(seed);
        println!("使用seed {} 生成{}人地图", seed, player_count);
        
        // 根据玩家数量确定地图大小 - 增加更多变化
        let base_size = match player_count {
            1 => 20,
            2 => 25,
            3..=4 => 30,
            5..=6 => 35,
            7..=8 => 40,
            9..=12 => 45,
            _ => 50,
        };
        
        // 添加随机变化 ±5
        let size_variation = rng.random_range(-5i32..=5i32);
        let map_size = ((base_size as i32) + size_variation).max(20).min(60) as usize;
        let (width, height) = (map_size, map_size);
        
        let mut attempts = 0;
        let max_attempts = 100;
        
        loop {
            attempts += 1;
            if attempts > max_attempts {
                println!("警告: 达到最大尝试次数，使用当前生成的地图");
                break;
            }
            
            // 创建基础地图
            let mut tiles = vec![vec![Tile::Wilderness; width]; height];
            
            // 首先生成王城位置，确保曼哈顿距离>=15
            let general_positions = Self::generate_valid_general_positions(&mut rng, width, height, player_count);
            if general_positions.is_empty() {
                println!("无法为{}个玩家在{}x{}地图上生成有效王城位置，尝试{}次", player_count, width, height, attempts);
                continue;
            }
            
            // 设置王城
            for (x, y) in &general_positions {
                tiles[*y][*x] = Tile::General {
                    count: 2,
                    user_id: "unassigned".to_string(),
                };
            }
            
            // 生成地形 - 完全随机分布
            let total_tiles = width * height;
            let mountain_density = rng.random_range(0.10..0.20); // 10%-20%的山
            let city_density = rng.random_range(0.08..0.15); // 8%-15%的城市
            
            let mountain_count = (total_tiles as f32 * mountain_density) as usize;
            let city_count = (total_tiles as f32 * city_density) as usize;
            
            // 随机生成山脉
            for _ in 0..mountain_count {
                let x = rng.random_range(0..width);
                let y = rng.random_range(0..height);
                
                // 如果位置为荒野就放山，否则跳过
                if matches!(tiles[y][x], Tile::Wilderness) {
                    tiles[y][x] = Tile::Mountain;
                }
            }
            
            // 随机生成城市
            for _ in 0..city_count {
                let x = rng.random_range(0..width);
                let y = rng.random_range(0..height);
                
                // 如果位置为荒野就放城市，否则跳过
                if matches!(tiles[y][x], Tile::Wilderness) {
                    let city_type = match rng.random_range(0..10) {
                        0..=1 => CityType::LargeCity,    // 20% 大城市
                        2..=4 => CityType::SmallCity,    // 30% 小城市
                        _ => CityType::Settlement,       // 50% 定居点
                    };
                    
                    let initial_count = match city_type {
                        CityType::Settlement => rng.random_range(15..=25),
                        CityType::SmallCity => rng.random_range(35..=55),
                        CityType::LargeCity => rng.random_range(75..=105),
                    };
                    
                    tiles[y][x] = Tile::City {
                        count: initial_count,
                        user_id: None,
                        city_type,
                    };
                }
            }
            
            // 验证王城连通性
            let temp_map = Self { tiles: tiles.clone(), width, height };
            if temp_map.validate_general_connectivity() {
                println!("成功生成{}x{}地图，{}个王城，{}座山，{}座城市", 
                        width, height, general_positions.len(), mountain_count, city_count);
                return Self { tiles, width, height };
            }
            
            println!("地图连通性验证失败，重新生成... (尝试 {}/{})", attempts, max_attempts);
        }
        
        // 如果达到最大尝试次数，生成一个简化的保证连通的地图
        Self::new_fallback_map(width, height, player_count, seed)
    }
    
    // 生成有效的王城位置，确保曼哈顿距离>=15
    fn generate_valid_general_positions(rng: &mut StdRng, width: usize, height: usize, player_count: usize) -> Vec<(usize, usize)> {
        let mut positions = Vec::new();
        let min_distance = 15;
        let max_attempts = 1000;
        
        // 确保地图足够大以容纳所需的王城
        let diagonal = (width * width + height * height) as f64;
        let max_possible_distance = diagonal.sqrt() as usize;
        
        if max_possible_distance < min_distance * 2 {
            println!("警告: 地图尺寸{}x{}可能不足以容纳{}个王城（最小距离{}）", width, height, player_count, min_distance);
        }
        
        for _ in 0..player_count {
            let mut attempts = 0;
            let mut placed = false;
            
            while attempts < max_attempts && !placed {
                attempts += 1;
                
                // 在边界内随机选择位置，留一些边距
                let margin = 3;
                let x = rng.random_range(margin..width.saturating_sub(margin));
                let y = rng.random_range(margin..height.saturating_sub(margin));
                
                // 检查与现有王城的距离
                let mut valid = true;
                for &(ex_x, ex_y) in &positions {
                    let manhattan_distance = ((x as i32 - ex_x as i32).abs() + (y as i32 - ex_y as i32).abs()) as usize;
                    if manhattan_distance < min_distance {
                        valid = false;
                        break;
                    }
                }
                
                if valid {
                    positions.push((x, y));
                    placed = true;
                    println!("王城{}放置在({}, {})，尝试{}次", positions.len(), x, y, attempts);
                }
            }
            
            if !placed {
                println!("无法为第{}个王城找到有效位置", positions.len() + 1);
                return Vec::new(); // 返回空向量表示失败
            }
        }
        
        positions
    }
    
    // 生成保底地图（确保连通性）
    fn new_fallback_map(width: usize, height: usize, player_count: usize, seed: u64) -> Self {
        let mut rng = StdRng::seed_from_u64(seed + 1000); // 使用不同的seed避免重复
        println!("生成保底地图{}x{}，{}个玩家", width, height, player_count);
        
        let mut tiles = vec![vec![Tile::Wilderness; width]; height];
        
        // 在地图四个象限分布王城，确保距离足够
        let mut positions = Vec::new();
        let quadrant_width = width / 2;
        let quadrant_height = height / 2;
        
        for i in 0..player_count {
            let (base_x, base_y) = match i % 4 {
                0 => (quadrant_width / 2, quadrant_height / 2), // 左上
                1 => (width - quadrant_width / 2, quadrant_height / 2), // 右上
                2 => (quadrant_width / 2, height - quadrant_height / 2), // 左下
                _ => (width - quadrant_width / 2, height - quadrant_height / 2), // 右下
            };
            
            // 在象限内添加小范围随机偏移
            let offset_range = quadrant_width.min(quadrant_height) / 4;
            let x_offset = rng.random_range(-(offset_range as i32)/2..=(offset_range as i32)/2);
            let y_offset = rng.random_range(-(offset_range as i32)/2..=(offset_range as i32)/2);
            
            let x = (base_x as i32 + x_offset).max(3).min(width as i32 - 4) as usize;
            let y = (base_y as i32 + y_offset).max(3).min(height as i32 - 4) as usize;
            
            positions.push((x, y));
            tiles[y][x] = Tile::General {
                count: 2,
                user_id: "unassigned".to_string(),
            };
        }
        
        // 添加少量随机地形，确保不阻断连通性
        let mountain_count = (width * height / 25).max(5); // 约4%的山
        let city_count = (width * height / 20).max(8); // 约5%的城市
        
        for _ in 0..mountain_count {
            let x = rng.random_range(1..width-1);
            let y = rng.random_range(1..height-1);
            
            if matches!(tiles[y][x], Tile::Wilderness) {
                tiles[y][x] = Tile::Mountain;
            }
        }
        
        for _ in 0..city_count {
            let x = rng.random_range(1..width-1);
            let y = rng.random_range(1..height-1);
            
            if matches!(tiles[y][x], Tile::Wilderness) {
                let city_type = match rng.random_range(0..3) {
                    0 => CityType::LargeCity,
                    1 => CityType::SmallCity,
                    _ => CityType::Settlement,
                };
                
                let initial_count = match city_type {
                    CityType::Settlement => rng.random_range(15..=25),
                    CityType::SmallCity => rng.random_range(35..=55),
                    CityType::LargeCity => rng.random_range(75..=105),
                };
                
                tiles[y][x] = Tile::City {
                    count: initial_count,
                    user_id: None,
                    city_type,
                };
            }
        }
        
        Self { tiles, width, height }
    }
    
    // 验证王城连通性
    fn validate_general_connectivity(&self) -> bool {
        let mut general_positions = Vec::new();
        
        // 找到所有王城位置
        for y in 0..self.height {
            for x in 0..self.width {
                if matches!(self.tiles[y][x], Tile::General { .. }) {
                    general_positions.push((x, y));
                }
            }
        }
        
        if general_positions.len() < 2 {
            return true; // 少于2个王城无需验证连通性
        }
        
        // 使用BFS验证所有王城是否连通
        let mut visited = vec![vec![false; self.width]; self.height];
        let mut queue = std::collections::VecDeque::new();
        
        // 从第一个王城开始BFS
        let start = general_positions[0];
        queue.push_back(start);
        visited[start.1][start.0] = true;
        let mut reachable_generals = 1;
        
        while let Some((x, y)) = queue.pop_front() {
            // 检查四个方向
            for (dx, dy) in [(0, 1), (1, 0), (0, -1), (-1, 0)] {
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                
                if nx >= 0 && nx < self.width as i32 && ny >= 0 && ny < self.height as i32 {
                    let nx = nx as usize;
                    let ny = ny as usize;
                    
                    if !visited[ny][nx] {
                        // 可以通过的地形：荒野、城市、王城
                        match &self.tiles[ny][nx] {
                            Tile::Wilderness | Tile::Territory { .. } | Tile::City { .. } | Tile::General { .. } => {
                                visited[ny][nx] = true;
                                queue.push_back((nx, ny));
                                
                                // 如果到达了另一个王城
                                if matches!(self.tiles[ny][nx], Tile::General { .. }) {
                                    reachable_generals += 1;
                                }
                            },
                            _ => {} // 山脉和虚空不可通过
                        }
                    }
                }
            }
        }
        
        reachable_generals == general_positions.len()
    }
    
    // 为队伍分配王城
    fn assign_generals(&mut self, team_ids: &[String]) {
        let mut general_positions = Vec::new();
        
        // 找到所有未分配的王城
        for y in 0..self.height {
            for x in 0..self.width {
                if let Tile::General { user_id, .. } = &self.tiles[y][x] {
                    if user_id == "unassigned" {
                        general_positions.push((x, y));
                    }
                }
            }
        }
        
        // 为每个队伍分配王城
        for (i, team_id) in team_ids.iter().enumerate() {
            if i < general_positions.len() {
                let (x, y) = general_positions[i];
                if let Tile::General { user_id, .. } = &mut self.tiles[y][x] {
                    *user_id = team_id.clone();
                }
            }
        }
    }
    
    // 在指定位置设置王城
    fn set_general(&mut self, x: usize, y: usize, team_id: String, initial_count: usize) -> Result<(), String> {
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
    fn get_visible_tiles(&self, user_id: &str) -> Vec<(usize, usize, Tile, bool)> {
        let mut visible = Vec::new();
        let mut checked = std::collections::HashSet::new();
        let mut has_vision = std::collections::HashSet::new();
        
        // 找到所有玩家拥有的tile
        for y in 0..self.height {
            for x in 0..self.width {
                let tile = &self.tiles[y][x];
                if let Some(owner) = tile.get_user_id() {
                    if owner == user_id {
                        // 标记该tile及其周围9格为有视野
                        for dy in -1..=1 {
                            for dx in -1..=1 {
                                let nx = x as i32 + dx;
                                let ny = y as i32 + dy;
                                if nx >= 0 && ny >= 0 && nx < self.width as i32 && ny < self.height as i32 {
                                    let nx = nx as usize;
                                    let ny = ny as usize;
                                    has_vision.insert((nx, ny));
                                    if !checked.contains(&(nx, ny)) {
                                        checked.insert((nx, ny));
                                        if let Some(visible_tile) = self.get_tile(nx, ny) {
                                            if !matches!(visible_tile, Tile::Void) {
                                                visible.push((nx, ny, visible_tile.clone(), true));
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
        
        // 添加所有山和城市的位置（对所有人可见），但如果没有视野就显示为山+问号
        for y in 0..self.height {
            for x in 0..self.width {
                let tile = &self.tiles[y][x];
                if (matches!(tile, Tile::Mountain) || matches!(tile, Tile::City { .. })) && !checked.contains(&(x, y)) {
                    let has_local_vision = has_vision.contains(&(x, y));
                    visible.push((x, y, tile.clone(), has_local_vision));
                    checked.insert((x, y));
                }
            }
        }
        
        // 添加所有void tiles，因为它们对所有玩家都可见
        for y in 0..self.height {
            for x in 0..self.width {
                let tile = &self.tiles[y][x];
                if matches!(tile, Tile::Void) && !checked.contains(&(x, y)) {
                    visible.push((x, y, tile.clone(), true));
                }
            }
        }
        
        visible
    }
    
    // 执行移动命令，返回游戏结果：Ok((获胜队伍, 被击败队伍)) 或 None表示游戏继续
    fn execute_move(&mut self, from_x: usize, from_y: usize, to_x: usize, to_y: usize, team_id: &str, is_half_move: bool) -> Result<(Option<String>, Option<String>), String> {
        println!("执行移动: 从({},{}) 到({},{}) 队伍: {} 半移动: {}", from_x, from_y, to_x, to_y, team_id, is_half_move);
        
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
                
                // 计算移动的兵力数量
                let move_count = if is_half_move {
                    // 半移动模式：移动总兵力的一半
                    // 例如：10 -> 移动5，留下5（10/2=5）
                    // 例如：11 -> 移动5，留下6（11/2=5，整数除法）
                    n / 2
                } else {
                    // 正常移动模式：移动 n-1 的兵力
                    n - 1
                };
                
                // 确保至少移动1个兵力，至少留下1个兵力
                let move_count = std::cmp::max(1, std::cmp::min(move_count, n - 1));
                
                // 计算源位置剩余兵力
                let remaining_count = n - move_count;
                
                println!("移动兵力: {} (半移动: {}), 剩余兵力: {}", move_count, is_half_move, remaining_count);
                
                // 设置起始位置剩余兵力
                if let Some(source_tile) = self.get_tile_mut(from_x, from_y) {
                    source_tile.set_count(remaining_count);
                }
                
                // 处理目标位置
                if let Some(target_tile) = self.get_tile_mut(to_x, to_y) {
                    match target_tile {
                        Tile::Wilderness => {
                            // 1. 若为w，变为己方t，兵力为move_count
                            *target_tile = Tile::Territory { count: move_count, user_id: team_id.to_string() };
                        }
                        Tile::Territory { count: m, user_id } => {
                            if user_id == team_id {
                                // 2. 若为我方t（兵力为m），兵力增为m+move_count
                                *m = *m + move_count;
                            } else {
                                // 3. 若为敌方t（兵力m），如果move_count>m，变为己方t（兵力move_count-m）；反之小于等于，变为敌方t（兵力m-move_count）
                                if move_count > *m {
                                    *target_tile = Tile::Territory { count: move_count - *m, user_id: team_id.to_string() };
                                } else {
                                    *m = *m - move_count;
                                }
                            }
                        }
                        Tile::General { count: m, user_id } => {
                            if user_id == team_id {
                                // 己方王城，兵力增加
                                *m = *m + move_count;
                            } else {
                                // 若为敌方g（兵力m），如果move_count>m，击败该玩家，继续检查是否游戏结束；反之小于等于，变为敌方g（兵力m-move_count）
                                if move_count > *m {
                                    let defeated_team = user_id.clone();
                                    // 将敌方王城变为己方塔，图标仍为g
                                    *target_tile = Tile::General { count: move_count - *m, user_id: team_id.to_string() };
                                    
                                    // 处理被击败玩家的所有兵力：兵力乘以1/2后变为己方兵力
                                    self.transfer_defeated_player_forces(&defeated_team, team_id);
                                    
                                    // 检查是否所有其他玩家都被击败（游戏结束条件）
                                    let remaining_teams = self.get_active_teams();
                                    if remaining_teams.len() <= 1 {
                                        // 游戏结束，当前队伍获胜
                                        return Ok((Some(team_id.to_string()), Some(defeated_team)));
                                    } else {
                                        // 游戏继续，但有玩家被击败
                                        return Ok((None, Some(defeated_team)));
                                    }
                                } else {
                                    *m = *m - move_count;
                                }
                            }
                        }
                        Tile::City { count: m, user_id, city_type } => {
                            match user_id {
                                Some(owner) if owner == team_id => {
                                    // 己方城市，兵力增加
                                    *m = *m + move_count;
                                }
                                Some(_) => {
                                    // 敌方城市，如果move_count>m，占领城市；反之小于等于，城市兵力减少
                                    if move_count > *m {
                                        *target_tile = Tile::City { 
                                            count: move_count - *m, // 占领后剩余兵力 = 攻击兵力 - 防守兵力
                                            user_id: Some(team_id.to_string()),
                                            city_type: city_type.clone()
                                        };
                                    } else {
                                        *m = *m - move_count;
                                    }
                                }
                                None => {
                                    // 无主城市，如果move_count>m，占领城市；反之小于等于，城市兵力减少
                                    if move_count > *m {
                                        *target_tile = Tile::City { 
                                            count: move_count - *m, // 占领后剩余兵力 = 攻击兵力 - 防守兵力
                                            user_id: Some(team_id.to_string()),
                                            city_type: city_type.clone()
                                        };
                                    } else {
                                        *m = *m - move_count;
                                    }
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
                
                Ok((None, None)) // 游戏继续，无玩家被击败
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
    
    // 转移被击败玩家的兵力给获胜者
    fn transfer_defeated_player_forces(&mut self, defeated_team: &str, winner_team: &str) {
        for row in &mut self.tiles {
            for tile in row {
                match tile {
                    Tile::Territory { count, user_id } if user_id == defeated_team => {
                        let new_count = *count / 2; // 兵力乘以1/2
                        if new_count > 0 {
                            *count = new_count;
                            *user_id = winner_team.to_string();
                        } else {
                            // 如果兵力为0，变回荒野
                            *tile = Tile::Wilderness;
                        }
                    }
                    Tile::City { count, user_id: Some(owner), city_type } if owner == defeated_team => {
                        let new_count = *count / 2; // 兵力乘以1/2
                        if new_count > 0 {
                            *count = new_count;
                            *tile = Tile::City { 
                                count: new_count, 
                                user_id: Some(winner_team.to_string()),
                                city_type: city_type.clone()
                            };
                        } else {
                            // 如果兵力为0，变为无主城市
                            *tile = Tile::City { 
                                count: 0, 
                                user_id: None,
                                city_type: city_type.clone()
                            };
                        }
                    }
                    // 王城已经在execute_move中处理过了
                    _ => {}
                }
            }
        }
    }
    
    // 获取当前地图上活跃的队伍
    fn get_active_teams(&self) -> Vec<String> {
        let mut teams = std::collections::HashSet::new();
        for row in &self.tiles {
            for tile in row {
                if let Some(user_id) = tile.get_user_id() {
                    teams.insert(user_id.clone());
                }
            }
        }
        teams.into_iter().collect()
    }
    
    // 增加所有城市的兵力（根据城市类型不同增长速度不同）
    fn increase_city_troops(&mut self, ticks_passed: u64) {
        for row in &mut self.tiles {
            for tile in row {
                if let Tile::City { count, user_id: Some(_), city_type } = tile {
                    // 只有被占领的城市才会增长兵力
                    match city_type {
                        CityType::Settlement => {
                            // 定居点每2秒增加1（每4个tick增加1，因为tick是0.5秒）
                            if ticks_passed % 4 == 0 && ticks_passed > 0 {
                                *count += 1;
                                //println!("定居点兵力增长: {} -> {}", *count - 1, *count);
                            }
                        }
                        CityType::SmallCity => {
                            // 小型城市每1秒增加1（每2个tick增加1）
                            if ticks_passed % 2 == 0 && ticks_passed > 0 {
                                *count += 1;
                                //println!("小型城市兵力增长: {} -> {}", *count - 1, *count);
                            }
                        }
                        CityType::LargeCity => {
                            // 大型城市每1秒增加2（每2个tick增加2）
                            if ticks_passed % 2 == 0 && ticks_passed > 0 {
                                *count += 2;
                                //println!("大型城市兵力增长: {} -> {}", *count - 2, *count);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 获取全图所有tiles（观众模式用）
    fn get_all_tiles(&self) -> Vec<(usize, usize, Tile, bool)> {
        let mut all_tiles = Vec::new();
        for y in 0..self.height {
            for x in 0..self.width {
                // 所有类型的tiles都包含，包括void（前端会特殊处理void）
                // 观众拥有完全视野
                all_tiles.push((x, y, self.tiles[y][x].clone(), true));
            }
        }
        all_tiles
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
    
    // 计算所有玩家的总兵力
    fn calculate_player_powers(&self) -> HashMap<String, u32> {
        let mut player_powers: HashMap<String, u32> = HashMap::new();
        
        for row in &self.tiles {
            for tile in row {
                if let Some(user_id) = tile.get_user_id() {
                    let count = tile.get_count() as u32;
                    *player_powers.entry(user_id.clone()).or_insert(0) += count;
                }
            }
        }
        
        player_powers
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
    id: usize,           // 组ID: 0-7为玩家组，8为观众组
    name: String,     // 组名称
    color: String,    // 组颜色
    players: Vec<String>, // 组内玩家ID列表
}

impl GroupInfo {
    fn new(id: usize) -> Self {
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
    player_groups: HashMap<String, usize>, // 新增：玩家ID -> 组ID映射
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
    id: usize,
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
        move_id: usize,
        is_half_move: bool, // 是否为分半移动
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
    ShouldStart {
        room_id: String,
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
        target_group_id: usize,
    },
    SetUserInfo {
        user_id: String,
        username: String,
    },
    RoomInfoUpdate(ReturnedRoomInfo),
    RedirectToHome {
        reason: String,
    },
    RedirectToGame {
        room_id: String,
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
        visible_tiles: Vec<(usize, usize, String, usize, Option<String>, bool)>, // (x, y, tile_type, count, user_id, has_vision)
        successful_move_sends: Vec<usize>, // 成功发送的move_id列表
        player_powers: Vec<(String, usize, u32, String)>, // (username, group_id, total_power, status) - 所有玩家的总兵力和状态
    },
    GameWin {
        room_id: String,
        winner: String,
    },
    PlayerEliminated {
        room_id: String,
        eliminated_player: String,
        eliminated_by: String,
    },
    MoveOk{
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
#[rtype(result = "()")]
pub struct CleanupDisconnectedPlayers;

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
    disconnected_players: HashMap<String, u64>, // userid -> disconnect_time - 新增：断线玩家时间跟踪
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
            disconnected_players: HashMap::new(), // 新增：初始化断线玩家跟踪
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
            disconnected_players: HashMap::new(), // 新增：初始化断线玩家跟踪
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
    
    // 处理玩家被击败
    fn handle_player_elimination(&mut self, room_id: &str, defeated_team: &str, winner_team: &str) {
        if let Some(room) = self.rooms.get_mut(room_id) {
            // 找到被击败的玩家并将其转为观众组（组8）
            let mut defeated_players = Vec::new();
            for (player_id, team) in &room.player_teams {
                if team == defeated_team {
                    defeated_players.push(player_id.clone());
                }
            }
            
            // 将被击败的玩家移动到观众组
            for player_id in defeated_players {
                room.player_groups.insert(player_id.clone(), 8);
                
                // 向被击败的玩家发送系统消息
                if let Some(recipient) = self.player_sessions.get(&player_id) {
                    let _ = recipient.do_send(UserMessage::Chat {
                        room_id: room_id.to_string(),
                        sender_id: "system".to_string(),
                        username: "系统".to_string(),
                        content: format!("您已被 {} 击败，现在转为观众身份，拥有全局视野", winner_team),
                    });
                }
            }
        }
    }
    
    // 向房间内所有玩家发送地图更新
    fn send_map_update_to_all_players(&mut self, room_id: &str, successful_move_sends: Vec<usize>) {
        if let Some(room) = self.rooms.get(room_id) {
            if let Some(ref game_map) = room.game_map {
                for p_id in &room.players {
                    if let Some(&group_id) = room.player_groups.get(p_id) {
                        let player_powers = self.calculate_player_powers(room_id);
                        
                        let formatted_tiles: Vec<(usize, usize, String, usize, Option<String>, bool)>;
                        
                        if group_id == 8 {
                            // 观众可以看到全图
                            formatted_tiles = game_map.get_all_tiles()
                                .into_iter().map(|(x, y, tile, has_vision)| {
                                    let (tile_type, count, user_id) = match tile {
                                        Tile::Wilderness => ("w".to_string(), 0, None),
                                        Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                        Tile::Mountain => ("m".to_string(), 0, None),
                                        Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                        Tile::Void => ("v".to_string(), 0, None),
                                        Tile::City { count, user_id, city_type } => {
                                            let type_str = match city_type {
                                                CityType::Settlement => "c_settlement",
                                                CityType::SmallCity => "c_smallcity",
                                                CityType::LargeCity => "c_largecity",
                                            };
                                            (type_str.to_string(), count, user_id)
                                        },
                                    };
                                    (x, y, tile_type, count, user_id, has_vision)
                                }).collect();
                        } else {
                            // 其他玩家根据视野规则看到地图
                            if let Some(team_id) = room.player_teams.get(p_id) {
                                formatted_tiles = game_map.get_visible_tiles(team_id)
                                    .into_iter().map(|(x, y, tile, has_vision)| {
                                        let (tile_type, count, user_id) = if has_vision {
                                            match tile {
                                                Tile::Wilderness => ("w".to_string(), 0, None),
                                                Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                                Tile::Mountain => ("m".to_string(), 0, None),
                                                Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                                Tile::Void => ("v".to_string(), 0, None),
                                                Tile::City { count, user_id, city_type } => {
                                                    let city_type_str = match city_type {
                                                        CityType::Settlement => "settlement",
                                                        CityType::SmallCity => "smallcity",
                                                        CityType::LargeCity => "largecity",
                                                    };
                                                    (format!("c_{}", city_type_str), count, user_id)
                                                },
                                            }
                                        } else {
                                            ("unknown".to_string(), 0, None)
                                        };
                                        (x, y, tile_type, count, user_id, has_vision)
                                    }).collect();
                            } else {
                                continue;
                            }
                        }
                        
                        if let Some(recipient) = self.player_sessions.get(p_id) {
                            let _ = recipient.do_send(UserMessage::MapUpdate {
                                room_id: room_id.to_string(),
                                visible_tiles: formatted_tiles,
                                successful_move_sends: successful_move_sends.clone(),
                                player_powers: player_powers.clone(),
                            });
                        }
                    }
                }
            }
        }
    }
    
    // 计算玩家兵力
    fn calculate_player_powers(&self, room_id: &str) -> Vec<(String, usize, u32, String)> {
        let mut player_powers = Vec::new();
        
        if let Some(room) = self.rooms.get(room_id) {
            if let Some(ref game_map) = room.game_map {
                let mut team_powers: HashMap<String, u32> = HashMap::new();
                
                // 计算每个队伍的总兵力
                for row in &game_map.tiles {
                    for tile in row {
                        if let Some(user_id) = tile.get_user_id() {
                            let power = tile.get_count() as u32;
                            *team_powers.entry(user_id.clone()).or_insert(0) += power;
                        }
                    }
                }
                
                // 为每个玩家生成兵力数据
                for (player_id, team_id) in &room.player_teams {
                    if let Some(username) = self.user_name_table.get(player_id) {
                        let group_id = room.player_groups.get(player_id).copied().unwrap_or(0);
                        let total_power = if group_id == 8 {
                            // 被击败的玩家兵力为0
                            0
                        } else {
                            team_powers.get(team_id).copied().unwrap_or(0)
                        };
                        
                        // 确定玩家状态
                        let status = if group_id == 8 {
                            "observer".to_string()
                        } else if self.disconnected_players.contains_key(player_id) {
                            "disconnected".to_string()
                        } else if total_power == 0 {
                            "defeated".to_string()
                        } else {
                            "active".to_string()
                        };
                        
                        player_powers.push((username.clone(), group_id, total_power, status));
                    }
                }
            }
        }
        
        player_powers
    }

    // 为玩家分配到最小的组（优先分配到玩家组0-7，如果都满了则分配到观众组8）
    fn assign_player_to_smallest_group(&mut self, room_id: &str, player_id: &str) {
        if let Some(room) = self.rooms.get_mut(room_id) {
            // 找到人数最少的玩家组（0-7）
            let mut smallest_group_id = 0usize;
            let mut smallest_group_size = usize::MAX;
            
            for i in 0..8 { // 只考虑玩家组0-7
                if let Some(group) = room.groups.get(i) {
                    if group.players.len() < smallest_group_size {
                        smallest_group_size = group.players.len();
                        smallest_group_id = i as usize;
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
    fn change_player_group(&mut self, room_id: &str, player_id: &str, target_group_id: usize) -> Result<(), String> {
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
                // 计算参与游戏的玩家数量（排除观众组8）
                let active_player_count = room.players.iter()
                    .filter(|player_id| {
                        if let Some(&group_id) = room.player_groups.get(*player_id) {
                            group_id != 8 // 排除观众组
                        } else {
                            true // 未分组的玩家视为参与游戏
                        }
                    })
                    .count();
                
                // 如果参与游戏的玩家数量<=1，返回0表示不需要强制开始
                if active_player_count <= 1 {
                    0
                } else {
                    let force_start_n_dict = HashMap::from([
                        (2, 2), (3, 3), (4, 3), (5, 4), (6, 4),
                        (7, 5), (8, 5), (9, 6), (10, 6), (11, 7),
                        (12, 7), (13, 8), (14, 8), (15, 9), (16, 9),
                    ]);
                    let required = *force_start_n_dict.get(&active_player_count).unwrap_or(&active_player_count);
                    required
                }
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
        
        // 启动断线用户清理任务：每10秒检查一次
        ctx.run_interval(std::time::Duration::from_secs(10), |_act, ctx| {
            ctx.address().do_send(CleanupDisconnectedPlayers);
        });
    }
    fn stopped(&mut self, _ctx: &mut Self::Context) {
        println!("GameServer stopped");
    }
}

impl Handler<Connect> for GameServer {
    type Result = Result<(), String>;

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        // 检查是否是重连（用户在断线列表中）
        let is_reconnecting = self.disconnected_players.contains_key(&msg.user_id);
        
        if is_reconnecting {
            // 重连情况：移除断线记录，恢复会话
            self.disconnected_players.remove(&msg.user_id);
            println!("用户 {} 重连成功，恢复会话", msg.user_id);
        } else if self.player_sessions.contains_key(&msg.user_id) {
            // 用户已在线且不是重连情况
            return Err(format!("用户ID {} 已经在线", msg.user_id));
        }
        
        println!("{}连接注册会话: 用户ID={}, 用户名={}", 
                if is_reconnecting { "重" } else { "新" }, msg.user_id, msg.username);
        
        // 注册会话和用户名
        self.player_sessions.insert(msg.user_id.clone(), msg.recipient);
        self.user_name_table.insert(msg.user_id.clone(), msg.username.clone());
        
        // 自动加入全局聊天房间（如果还不在）
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
        println!("用户 {} 断开连接，开始30秒会话保留期", msg.player_id);
        
        // 移除会话连接，但保留其他信息
        self.player_sessions.remove(&msg.player_id);
        
        // 记录断线时间，开始30秒倒计时
        let current_time = Self::current_timestamp();
        self.disconnected_players.insert(msg.player_id.clone(), current_time);
        
        // 不立即从房间中移除玩家，保持其在房间状态
        // 但需要通知其他玩家该用户断线了
        for (room_id, room) in self.rooms.iter() {
            if room.players.contains(&msg.player_id) {
                // 向房间内其他玩家发送断线通知
                for other_player_id in &room.players {
                    if other_player_id != &msg.player_id {
                        if let Some(recipient) = self.player_sessions.get(other_player_id) {
                            let username = self.user_name_table.get(&msg.player_id)
                                .cloned()
                                .unwrap_or_else(|| "Unknown".to_string());
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: "system".to_string(),
                                username: "系统".to_string(),
                                content: format!("玩家 {} 断开连接，会话将保留30秒", username),
                            });
                        }
                    }
                }
            }
        }
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
                                let _ = recipient.do_send(UserMessage::Chat {
                                    room_id: room_id.clone(),
                                    sender_id: "system".to_string(),
                                    username: "系统".to_string(),
                                    content: format!("玩家 {} 离开房间", player_id),
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
                        let mut target_group_id = 8usize; // 默认分配到观众组
                        let mut should_redirect_to_game = false;
                        
                        // 如果游戏未开始，尝试分配到玩家组
                        if room.status == "waiting" {
                            // 找到人数最少的玩家组（0-7）
                            let mut smallest_group_id = 0usize;
                            let mut smallest_group_size = usize::MAX;
                            
                            for i in 0..8 { // 只考虑玩家组0-7
                                if let Some(group) = room.groups.get(i) {
                                    if group.players.len() < smallest_group_size {
                                        smallest_group_size = group.players.len();
                                        smallest_group_id = i as usize;
                                    }
                                }
                            }
                            
                            // 如果玩家组还有空位（假设每组最大2人），则分配到玩家组
                            if smallest_group_size < 2 {
                                target_group_id = smallest_group_id;
                            }
                        } else if room.status == "playing" {
                            // 游戏进行中，检查玩家是否之前就在某个组中
                            let mut found_previous_group = false;
                            for (group_id, group) in room.groups.iter_mut().enumerate() {
                                if group.players.contains(&player_id.to_string()) {
                                    // 玩家之前就在这个组中，保持原有分配
                                    target_group_id = group_id as usize;
                                    found_previous_group = true;
                                    should_redirect_to_game = true;
                                    println!("游戏进行中，玩家 {} 恢复到原有组 {} ({})", player_id, group_id, group.name);
                                    break;
                                }
                            }
                            
                            if !found_previous_group {
                                // 新玩家，分配为观众
                                target_group_id = 8;
                                should_redirect_to_game = true;
                                println!("游戏进行中，新玩家 {} 自动分配为观众并将跳转到游戏页面", player_id);
                            }
                        }
                        
                        // 将玩家添加到选定的组（如果还没有在组中）
                        if let Some(group) = room.groups.get_mut(target_group_id as usize) {
                            if !group.players.contains(&player_id.to_string()) {
                                group.players.push(player_id.to_string());
                            }
                            room.player_groups.insert(player_id.to_string(), target_group_id);
                            
                            if target_group_id == 8 {
                                println!("玩家 {} 被分配为观众 (游戏状态: {})", player_id, room.status);
                            } else {
                                println!("玩家 {} 被自动分配到组 {} ({})", player_id, target_group_id, group.name);
                            }
                        }
                        
                        // 如果是游戏中加入，发送跳转消息
                        if should_redirect_to_game {
                            if let Some(recipient) = self.player_sessions.get(&player_id) {
                                let _ = recipient.do_send(UserMessage::RedirectToGame {
                                    room_id: room_id.clone(),
                                });
                            }
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
                    
                    // 计算参与游戏的玩家数量（排除观众组8）
                    let active_player_count = room.players.iter()
                        .filter(|player_id| {
                            if let Some(&group_id) = room.player_groups.get(*player_id) {
                                group_id != 8 // 排除观众组
                            } else {
                                true // 未分组的玩家视为参与游戏
                            }
                        })
                        .count();
                    
                    // 如果参与游戏的玩家数量<=1，不允许强制开始
                    if active_player_count <= 1 {
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(
                                UserMessage::Err("参与游戏的玩家数量不足，无法开始游戏".to_string())
                            );
                        }
                        return;
                    }
                    
                    // 检查是否达到强制开始所需人数（基于参与游戏的玩家数量）
                    let required_force_start_count = *force_start_n_dict.get(&active_player_count).unwrap_or(&active_player_count);
                    
                    if room.force_start_players.len() >= required_force_start_count {
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
                        
                        // 初始化游戏地图 - 根据参与游戏的玩家数量生成随机地图
                        let mut game_map = GameMap::new_random(active_player_count);
                        
                        // 为活跃队伍分配王城
                        game_map.assign_generals(&active_teams);
                        
                        room.game_map = Some(game_map);
                        println!("游戏地图已生成，玩家数={}, 队伍数={}", active_player_count, active_teams.len());
                        
                        // 向所有玩家发送初始地图数据
                        for p_id in &room.players {
                            if let Some(ref game_map) = room.game_map {
                                if let Some(&group_id) = room.player_groups.get(p_id) {
                                    let formatted_tiles: Vec<(usize, usize, String, usize, Option<String>, bool)>;
                                    
                                    if group_id == 8 {
                                        // 观众可以看到全图
                                        formatted_tiles = game_map.get_all_tiles()
                                            .into_iter().map(|(x, y, tile, has_vision)| {
                                                let (tile_type, count, user_id) = match tile {
                                                    Tile::Wilderness => ("w".to_string(), 0, None),
                                                    Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                                    Tile::Mountain => ("m".to_string(), 0, None),
                                                    Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                                    Tile::Void => ("v".to_string(), 0, None),
                                                    Tile::City { count, user_id, city_type } => {
                                                        let type_str = match city_type {
                                                            CityType::Settlement => "c_settlement",
                                                            CityType::SmallCity => "c_smallcity",
                                                            CityType::LargeCity => "c_largecity",
                                                        };
                                                        (type_str.to_string(), count, user_id)
                                                    },
                                                };
                                                (x, y, tile_type, count, user_id, has_vision)
                                            }).collect();
                                    } else if let Some(team_id) = room.player_teams.get(p_id) {
                                        // 玩家只能看到自己队伍的视野
                                        formatted_tiles = game_map.get_visible_tiles(team_id)
                                            .into_iter().map(|(x, y, tile, has_vision)| {
                                                let (tile_type, count, user_id) = if has_vision {
                                                    // 有视野时显示真实数据
                                                    match tile {
                                                        Tile::Wilderness => ("w".to_string(), 0, None),
                                                        Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                                        Tile::Mountain => ("m".to_string(), 0, None),
                                                        Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                                        Tile::Void => ("v".to_string(), 0, None),
                                                        Tile::City { count, user_id, city_type } => {
                                                            let type_str = match city_type {
                                                                CityType::Settlement => "c_settlement",
                                                                CityType::SmallCity => "c_smallcity",
                                                                CityType::LargeCity => "c_largecity",
                                                            };
                                                            (type_str.to_string(), count, user_id)
                                                        },
                                                    }
                                                } else {
                                                    // 无视野时统一显示为未知地形，防止作弊
                                                    ("unknown".to_string(), 0, None)
                                                };
                                                (x, y, tile_type, count, user_id, has_vision)
                                            }).collect();
                                    } else {
                                        continue; // 跳过没有队伍分配的玩家
                                    }
                                    
                                    // 计算所有玩家的兵力（包括不可见部分）
                                    let team_powers = game_map.calculate_player_powers();
                                    let player_powers: Vec<(String, usize, u32, String)> = room.player_groups.iter()
                                        .filter_map(|(player_id, &group_id)| {
                                            if group_id < 8 { // 只包括玩家组，排除观众
                                                if let Some(team_id) = room.player_teams.get(player_id) {
                                                    let total_power = team_powers.get(team_id).copied().unwrap_or(0);
                                                    let username = self.user_name_table.get(player_id)
                                                        .cloned()
                                                        .unwrap_or_else(|| format!("玩家#{}", player_id.chars().take(8).collect::<String>()));
                                                    let status = if total_power == 0 {
                                                        "defeated".to_string()
                                                    } else {
                                                        "active".to_string()
                                                    };
                                                    Some((username, group_id, total_power, status))
                                                } else {
                                                    None
                                                }
                                            } else {
                                                None
                                            }
                                        })
                                        .collect();
                                    
                                    if let Some(recipient) = self.player_sessions.get(p_id) {
                                        let _ = recipient.do_send(UserMessage::MapUpdate {
                                            room_id: room_id.clone(),
                                            visible_tiles: formatted_tiles,
                                            successful_move_sends: vec![],
                                            player_powers,
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
                        /*
                        let room_id_clone2 = room_id.clone();
                        ctx.run_later(std::time::Duration::from_secs(60), move |_act, ctx| {
                            ctx.address().do_send(EndGameMessage {
                                room_id: room_id_clone2,
                            });
                        });
                         */
                        // 广播更新后的房间信息
                        if let Some(room_info) = self.get_room_info(&room_id) {
                            self.broadcast_room_info(&room_id, room_info);
                        }
                    } else {
                        /* 
                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                            let _ = recipient.do_send(
                                UserMessage::Err(format!("需要{}名玩家同意强制开始，当前只有{}名玩家同意", 
                                                        required_force_start_count, room.force_start_players.len()))
                            );
                        }
                        */
                        // 广播更新后的房间信息（即使人数不够也要更新前端）
                        if let Some(room_info) = self.get_room_info(&room_id) {
                            self.broadcast_room_info(&room_id, room_info);
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
            UserMessage::ShouldStart { room_id } => {
                println!("处理 ShouldStart 请求，房间: {}", room_id);
                // 更新房间活动时间
                self.update_room_activity(&room_id);
                
                if let Some(room) = self.rooms.get(&room_id) {
                    // 计算参与游戏的玩家数量（排除观众组8）
                    let active_player_count = room.players.iter()
                        .filter(|player_id| {
                            if let Some(&group_id) = room.player_groups.get(*player_id) {
                                group_id != 8 // 排除观众组
                            } else {
                                true // 未分组的玩家视为参与游戏
                            }
                        })
                        .count();
                    
                    // 使用与ForceStart相同的逻辑计算所需人数
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
                    
                    let required_count = *force_start_n_dict.get(&active_player_count).unwrap_or(&active_player_count);
                    let current_force_count = room.force_start_players.len();
                    
                    println!("房间 {} 参与游戏玩家数: {}, 当前force start人数: {}, 需要人数: {}", 
                             room_id, active_player_count, current_force_count, required_count);
                    
                    if current_force_count >= required_count && active_player_count > 1 {
                        println!("满足开始条件，启动游戏: {}", room_id);
                        // 满足条件，开始游戏
                        let start_message = UserMessage::StartGame {
                            room_id: room_id.clone(),
                        };
                        self.handle(start_message, ctx);
                    } else {
                        println!("不满足开始条件，房间 {}: 当前{}/需要{}, 参与玩家: {}", 
                                room_id, current_force_count, required_count, active_player_count);
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
                        
                        // 检查是否满足forcestart条件（当有人切换到观众组时）
                        if let Some(room) = self.rooms.get_mut(&room_id) {
                            if !room.force_start_players.is_empty() && room.status == "waiting" {
                                // 计算参与游戏的玩家数量（排除观众组8）
                                let active_player_count = room.players.iter()
                                    .filter(|player_id| {
                                        if let Some(&group_id) = room.player_groups.get(*player_id) {
                                            group_id != 8 // 排除观众组
                                        } else {
                                            true // 未分组的玩家视为参与游戏
                                        }
                                    })
                                    .count();
                                    
                                // forcestart所需人数规则
                                let force_start_n_dict = HashMap::from([
                                    (2, 2), (3, 3), (4, 3), (5, 4), (6, 4), (7, 5), (8, 5),
                                    (9, 6), (10, 6), (11, 7), (12, 7), (13, 8), (14, 8), (15, 9), (16, 9),
                                ]);
                                
                                if active_player_count >= 2 {
                                    let required_force_start_count = *force_start_n_dict.get(&active_player_count).unwrap_or(&active_player_count);
                                    
                                    if room.force_start_players.len() >= required_force_start_count {
                                        // 满足条件，开始游戏
                                        println!("ChangeGroup触发forcestart: 活跃玩家数={}, 需要forcestart数={}, 实际forcestart数={}", 
                                                active_player_count, required_force_start_count, room.force_start_players.len());
                                        
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
                                        
                                        // 更新房间状态为游戏中
                                        room.status = "playing".to_string();
                                        room.force_start_players.clear();
                                        room.game_turn = 1;
                                        room.turn_half = true;
                                        room.player_actions.clear();
                                        
                                        // 创建游戏地图和分配队伍
                                        let mut active_teams = Vec::new();
                                        room.player_teams.clear(); // 清空现有的team分配
                                        
                                        for p_id in &room.players {
                                            if let Some(&group_id) = room.player_groups.get(p_id) {
                                                if group_id != 8 {
                                                    let team_id = format!("team_{}", group_id);
                                                    if !active_teams.contains(&team_id) {
                                                        active_teams.push(team_id.clone());
                                                    }
                                                    // 将玩家分配到对应的队伍
                                                    room.player_teams.insert(p_id.clone(), team_id);
                                                }
                                            }
                                        }
                                        
                                        // 使用活跃玩家数量创建地图，而不是队伍数量
                                        let mut game_map = GameMap::new_random(active_player_count);
                                        game_map.assign_generals(&active_teams);
                                        room.game_map = Some(game_map);
                                        
                                        println!("地图创建完成: 玩家数={}, 队伍数={}, 队伍列表={:?}", 
                                                active_player_count, active_teams.len(), active_teams);
                                        
                                        // 发送初始地图
                                        self.send_map_update_to_all_players(&room_id, vec![]);
                                        
                                        // 启动回合制系统：每500ms处理一个半回合
                                        let room_id_clone = room_id.clone();
                                        ctx.run_later(std::time::Duration::from_millis(500), move |_act, ctx| {
                                            ctx.address().do_send(GameTurnMessage {
                                                room_id: room_id_clone,
                                            });
                                        });
                                    }
                                } else {
                                    // 参与游戏的玩家不足，清除forcestart
                                    println!("参与游戏的玩家不足: {}, 清除forcestart", active_player_count);
                                    room.force_start_players.clear();
                                    for p_id in &room.players {
                                        if let Some(recipient) = self.player_sessions.get(p_id) {
                                            let _ = recipient.do_send(UserMessage::Chat {
                                                room_id: room_id.clone(),
                                                sender_id: "system".to_string(),
                                                username: "系统".to_string(),
                                                content: "参与游戏的玩家不足，已取消强制开始".to_string(),
                                            });
                                        }
                                    }
                                }
                            }
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
            UserMessage::GameMove { room_id, player_id, from_x, from_y, to_x, to_y, move_id, is_half_move } => {
                println!("收到GameMove消息: 房间={}, 玩家={}, ({},{}) -> ({},{}), 半移动={}", 
                         room_id, player_id, from_x, from_y, to_x, to_y, is_half_move);
                
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
                        match game_map.execute_move(from_x, from_y, to_x, to_y, &team_id, is_half_move) {
                            Ok((winner_team, defeated_team)) => {
                                match (winner_team, defeated_team) {
                                    (Some(winner), Some(defeated)) => {
                                        // 有玩家获胜，游戏结束
                                        println!("玩家 {} (队伍: {}) 成功执行移动并获胜: ({},{}) -> ({},{})", 
                                                 player_id, team_id, from_x, from_y, to_x, to_y);
                                        
                                        // 更新房间状态
                                        room.status = "finished".to_string();
                                        
                                        // 收集被击败的玩家
                                        let mut defeated_players = Vec::new();
                                        for (p_id, t_id) in &room.player_teams {
                                            if t_id == &defeated {
                                                defeated_players.push(p_id.clone());
                                            }
                                        }
                                        
                                        // 将被击败的玩家移动到观众组
                                        for p_id in defeated_players {
                                            room.player_groups.insert(p_id.clone(), 8);
                                        }
                                        
                                        // 收集房间内的所有玩家用于消息发送
                                        let room_players = room.players.clone();
                                        
                                        // 释放对room的可变借用
                                        let _ = room;
                                        
                                        // 向所有玩家发送游戏胜利消息
                                        for p_id in &room_players {
                                            if let Some(recipient) = self.player_sessions.get(p_id) {
                                                let _ = recipient.do_send(UserMessage::GameWin {
                                                    room_id: room_id.clone(),
                                                    winner: winner.clone(),
                                                });
                                            }
                                        }
                                        
                                        // 向操作玩家发送成功确认
                                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                                            let _ = recipient.do_send(UserMessage::Ok);
                                        }
                                    }
                                    (None, Some(defeated)) => {
                                        // 有玩家被击败，但游戏继续
                                        println!("玩家 {} (队伍: {}) 成功执行移动，击败了队伍 {}: ({},{}) -> ({},{})", 
                                                 player_id, team_id, defeated, from_x, from_y, to_x, to_y);
                                        
                                        // 收集被击败的玩家
                                        let mut defeated_players = Vec::new();
                                        for (p_id, t_id) in &room.player_teams {
                                            if t_id == &defeated {
                                                defeated_players.push(p_id.clone());
                                            }
                                        }
                                        
                                        // 将被击败的玩家移动到观众组
                                        for p_id in &defeated_players {
                                            room.player_groups.insert(p_id.clone(), 8);
                                        }
                                        
                                        // 收集房间内的所有玩家用于消息发送
                                        let room_players = room.players.clone();
                                        
                                        // 释放对room的可变借用
                                        let _ = room;
                                        
                                        // 向被击败的玩家发送系统消息
                                        for p_id in &defeated_players {
                                            if let Some(recipient) = self.player_sessions.get(p_id) {
                                                let _ = recipient.do_send(UserMessage::Chat {
                                                    room_id: room_id.clone(),
                                                    sender_id: "system".to_string(),
                                                    username: "系统".to_string(),
                                                    content: format!("您已被 {} 击败，现在转为观众身份，拥有全局视野", team_id),
                                                });
                                            }
                                        }
                                        
                                        // 向所有玩家发送玩家被击败消息
                                        for p_id in &room_players {
                                            if let Some(recipient) = self.player_sessions.get(p_id) {
                                                let _ = recipient.do_send(UserMessage::PlayerEliminated {
                                                    room_id: room_id.clone(),
                                                    eliminated_player: defeated.clone(),
                                                    eliminated_by: team_id.clone(),
                                                });
                                            }
                                        }
                                        
                                        // 发送地图更新
                                        self.send_map_update_to_all_players(&room_id, vec![move_id]);
                                        
                                        // 向操作玩家发送成功确认
                                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                                            let _ = recipient.do_send(UserMessage::Ok);
                                        }
                                    }
                                    (None, None) => {
                                        // 移动成功，游戏继续，无玩家被击败
                                        println!("玩家 {} (队伍: {}) 成功执行移动: ({},{}) -> ({},{})", 
                                                 player_id, team_id, from_x, from_y, to_x, to_y);
                                        
                                        // 收集房间内的所有玩家用于消息发送
                                        let _room_players = room.players.clone();
                                        
                                        // 释放对room的可变借用
                                        let _ = room;
                                        
                                        // 发送地图更新
                                        self.send_map_update_to_all_players(&room_id, vec![move_id]);
                                        
                                        // 向操作玩家发送成功确认
                                        if let Some(recipient) = self.player_sessions.get(&player_id) {
                                            let _ = recipient.do_send(UserMessage::Ok);
                                        }
                                    }
                                    (Some(_), None) => {
                                        // 这种情况不应该出现（有获胜者但无被击败者）
                                        println!("警告: 不正常的游戏状态 - 有获胜者但无被击败者");
                                    }
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
                } else {
                    if let Some(recipient) = self.player_sessions.get(&player_id) {
                        let _ = recipient.do_send(UserMessage::Err("房间不存在".to_string()));
                    }
                    return;
                }
                
                // 使用方法广播地图更新
                self.send_map_update_to_all_players(&room_id, vec![move_id]);
            }
            _ => {
                // 其他消息类型暂不处理
            }
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
    successful_move_sends: Vec<usize>,
}

impl GlobalUserSession {
    pub fn new(user_id: String, username: String, addr: Addr<GameServer>) -> Self {
        Self {
            user_id,
            username,
            addr,
            successful_move_sends: Vec::new(),
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
            UserMessage::MoveOk{} => {
                let move_ok_json = serde_json::json!({
                    "type": "move_ok",
                });
                ctx.text(move_ok_json.to_string());
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
            UserMessage::RedirectToGame { room_id } => {
                let redirect_json = serde_json::json!({
                    "type": "redirect_to_game",
                    "room_id": room_id,
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
            UserMessage::MapUpdate { room_id, visible_tiles, successful_move_sends, player_powers } => {
                let map_update_json = serde_json::json!({
                    "type": "map_update",
                    "room_id": room_id,
                    "visible_tiles": visible_tiles,
                    "successful_move_sends": successful_move_sends,
                    "player_powers": player_powers,
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
            UserMessage::PlayerEliminated { room_id, eliminated_player, eliminated_by } => {
                let eliminated_json = serde_json::json!({
                    "type": "player_eliminated",
                    "room_id": room_id,
                    "eliminated_player": eliminated_player,
                    "eliminated_by": eliminated_by,
                });
                println!("GlobalUserSession 发送玩家被击败消息: {}", eliminated_json);
                ctx.text(eliminated_json.to_string());
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
                            "should_start" => {
                                if let Some(room_id) = json["room_id"].as_str() {
                                    println!("收到should_start请求，房间: {}", room_id);
                                    self.addr.do_send(UserMessage::ShouldStart {
                                        room_id: room_id.to_string(),
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
                                    Some(to_y),
                                    Some(move_id)
                                ) = (
                                    json["room_id"].as_str(),
                                    json["from_x"].as_u64(),
                                    json["from_y"].as_u64(),
                                    json["to_x"].as_u64(),
                                    json["to_y"].as_u64(),
                                    json["move_id"].as_u64(), // 解析 move_id 但暂不使用
                                ) {
                                    println!("向GameServer发送GameMove: room_id={}, from=({},{}), to=({},{}), move_id={}", 
                                             room_id, from_x, from_y, to_x, to_y,move_id);
                                    self.addr.do_send(UserMessage::GameMove {
                                        room_id: room_id.to_string(),
                                        player_id: self.user_id.clone(),
                                        from_x: from_x as usize,
                                        from_y: from_y as usize,
                                        to_x: to_x as usize,
                                        to_y: to_y as usize,
                                        move_id: move_id as usize,
                                        is_half_move: json["is_half_move"].as_bool().unwrap_or(false),
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
                                        target_group_id: target_group_id as usize,
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
                // 每半秒（每个回合的下半秒）所有玩家王城兵力增加1
                if room.turn_half {
                    println!("回合 {} - 增加王城兵力", room.game_turn);
                    game_map.increase_general_troops();
                }
                
                // 增加城市兵力（每个半回合都检查，根据城市类型不同的增长速度）
                let total_ticks = room.game_turn * 2 + if room.turn_half { 1 } else { 0 };
                println!("回合 {} - 检查城市兵力增长，总tick数: {}", room.game_turn, total_ticks);
                game_map.increase_city_troops(total_ticks.into());
                
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
                
                // 3. 检查单人胜利条件
                if let Some(ref game_map) = room.game_map {
                    let active_teams = game_map.get_active_teams();
                    if active_teams.len() == 1 {
                        // 只剩一个活跃队伍，游戏结束
                        let winner_team = active_teams[0].clone();
                        room.status = "ended".to_string();
                        
                        // 向所有玩家发送胜利消息
                        for player_id in &room.players {
                            if let Some(recipient) = self.player_sessions.get(player_id) {
                                let _ = recipient.do_send(UserMessage::GameWin {
                                    room_id: msg.room_id.clone(),
                                    winner: winner_team.clone(),
                                });
                            }
                        }
                        return; // 游戏结束，不再继续处理回合
                    }
                }
                
                // 4. 向所有玩家广播地图更新和回合信息
                for player_id in &room.players {
                    if let Some(ref game_map) = room.game_map {
                        if let Some(&group_id) = room.player_groups.get(player_id) {
                            let formatted_tiles: Vec<(usize, usize, String, usize, Option<String>, bool)>;
                            
                            if group_id == 8 {
                                // 观众可以看到全图
                                formatted_tiles = game_map.get_all_tiles()
                                    .into_iter().map(|(x, y, tile, has_vision)| {
                                        let (tile_type, count, user_id) = match tile {
                                            Tile::Wilderness => ("w".to_string(), 0, None),
                                            Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                            Tile::Mountain => ("m".to_string(), 0, None),
                                            Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                            Tile::Void => ("v".to_string(), 0, None),
                                            Tile::City { count, user_id, city_type } => {
                                                let type_str = match city_type {
                                                    CityType::Settlement => "c_settlement",
                                                    CityType::SmallCity => "c_smallcity",
                                                    CityType::LargeCity => "c_largecity",
                                                };
                                                (type_str.to_string(), count, user_id)
                                            },
                                        };
                                        (x, y, tile_type, count, user_id, has_vision)
                                    }).collect();
                            } else if let Some(team_id) = room.player_teams.get(player_id) {
                                // 玩家只能看到自己队伍的视野
                                formatted_tiles = game_map.get_visible_tiles(team_id)
                                    .into_iter().map(|(x, y, tile, has_vision)| {
                                        let (tile_type, count, user_id) = if has_vision {
                                            // 有视野时显示真实数据
                                            match tile {
                                                Tile::Wilderness => ("w".to_string(), 0, None),
                                                Tile::Territory { count, user_id } => ("t".to_string(), count, Some(user_id)),
                                                Tile::Mountain => ("m".to_string(), 0, None),
                                                Tile::General { count, user_id } => ("g".to_string(), count, Some(user_id)),
                                                Tile::Void => ("v".to_string(), 0, None),
                                                Tile::City { count, user_id, city_type } => {
                                                    let type_str = match city_type {
                                                        CityType::Settlement => "c_settlement",
                                                        CityType::SmallCity => "c_smallcity",
                                                        CityType::LargeCity => "c_largecity",
                                                    };
                                                    (type_str.to_string(), count, user_id)
                                                },
                                            }
                                        } else {
                                            // 无视野时统一显示为未知地形，防止作弊
                                            ("unknown".to_string(), 0, None)
                                        };
                                        (x, y, tile_type, count, user_id, has_vision)
                                    }).collect();
                            } else {
                                continue; // 跳过没有队伍分配的玩家
                            }
                            
                            // 计算所有玩家的兵力（包括不可见部分）
                            let team_powers = game_map.calculate_player_powers();
                            let player_powers: Vec<(String, usize, u32, String)> = room.player_groups.iter()
                                .filter_map(|(pid, &group_id)| {
                                    if group_id < 8 { // 只包括玩家组，排除观众
                                        if let Some(team_id) = room.player_teams.get(pid) {
                                            let total_power = team_powers.get(team_id).copied().unwrap_or(0);
                                            let username = self.user_name_table.get(pid)
                                                .cloned()
                                                .unwrap_or_else(|| format!("玩家#{}", pid.chars().take(8).collect::<String>()));
                                            let status = if total_power == 0 {
                                                "defeated".to_string()
                                            } else {
                                                "active".to_string()
                                            };
                                            Some((username, group_id, total_power, status))
                                        } else {
                                            None
                                        }
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                            
                            if let Some(recipient) = self.player_sessions.get(player_id) {
                                let _ = recipient.do_send(UserMessage::MapUpdate {
                                    room_id: msg.room_id.clone(),
                                    visible_tiles: formatted_tiles,
                                    successful_move_sends: vec![],
                                    player_powers,
                                });
                            }
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
                    // 不要在这里删除用户名，因为玩家可能在其他房间中
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

impl Handler<CleanupDisconnectedPlayers> for GameServer {
    type Result = ();

    fn handle(&mut self, _msg: CleanupDisconnectedPlayers, _: &mut Context<Self>) {
        let current_time = Self::current_timestamp();
        let session_timeout = 30; // 30秒会话保留时间
        
        let mut players_to_remove = Vec::new();
        
        // 检查所有断线玩家
        for (player_id, disconnect_time) in &self.disconnected_players {
            if current_time - disconnect_time > session_timeout {
                players_to_remove.push(player_id.clone());
            }
        }
        
        // 彻底移除过期的断线玩家
        for player_id in players_to_remove {
            println!("断线玩家 {} 会话过期，彻底移除", player_id);
            
            // 从断线列表中移除
            self.disconnected_players.remove(&player_id);
            
            // 从所有房间中移除
            let mut rooms_to_update = Vec::new();
            for (room_id, room) in self.rooms.iter_mut() {
                if room.players.contains(&player_id) {
                    room.players.retain(|id| id != &player_id);
                    room.force_start_players.retain(|id| id != &player_id);
                    room.player_count -= 1;
                    rooms_to_update.push(room_id.clone());
                    
                    // 通知房间内其他玩家
                    for other_player_id in &room.players {
                        if let Some(recipient) = self.player_sessions.get(other_player_id) {
                            let username = self.user_name_table.get(&player_id)
                                .cloned()
                                .unwrap_or_else(|| "Unknown".to_string());
                            let _ = recipient.do_send(UserMessage::Chat {
                                room_id: room_id.clone(),
                                sender_id: "system".to_string(),
                                username: "系统".to_string(),
                                content: format!("玩家 {} 会话过期，已从房间移除", username),
                            });
                        }
                    }
                }
                
                // 从分组中移除
                for group in room.groups.iter_mut() {
                    group.players.retain(|id| id != &player_id);
                }
                room.player_groups.remove(&player_id);
            }
            
            // 更新受影响的房间
            for room_id in rooms_to_update {
                // 检查游戏是否仍在进行且是否需要检查胜利条件
                let should_check_victory = if let Some(room) = self.rooms.get(&room_id) {
                    room.status == "playing" && room.game_map.is_some()
                } else {
                    false
                };
                
                if should_check_victory {
                    // 获取活跃队伍信息
                    let active_teams = if let Some(room) = self.rooms.get(&room_id) {
                        if let Some(ref game_map) = room.game_map {
                            game_map.get_active_teams()
                        } else {
                            Vec::new()
                        }
                    } else {
                        Vec::new()
                    };
                    
                    if active_teams.len() == 1 {
                        // 只剩一个活跃队伍，游戏结束
                        let winner_team = active_teams[0].clone();
                        
                        // 获取房间玩家列表用于发送消息
                        let room_players = if let Some(room) = self.rooms.get(&room_id) {
                            room.players.clone()
                        } else {
                            Vec::new()
                        };
                        
                        // 更新房间状态
                        if let Some(room_mut) = self.rooms.get_mut(&room_id) {
                            room_mut.status = "ended".to_string();
                        }
                        
                        // 向所有玩家发送胜利消息
                        for player_id in &room_players {
                            if let Some(recipient) = self.player_sessions.get(player_id) {
                                let _ = recipient.do_send(UserMessage::GameWin {
                                    room_id: room_id.clone(),
                                    winner: winner_team.clone(),
                                });
                            }
                        }
                    }
                }
                
                if let Some(room_info) = self.get_room_info(&room_id) {
                    self.broadcast_room_info(&room_id, room_info);
                }
            }
            
            // 从用户名表中移除（只有当玩家不在任何房间时才移除）
            let mut is_in_any_room = false;
            for room in self.rooms.values() {
                if room.players.contains(&player_id) {
                    is_in_any_room = true;
                    break;
                }
            }
            if !is_in_any_room {
                self.user_name_table.remove(&player_id);
            }
        }
    }
}

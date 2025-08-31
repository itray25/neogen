# WebSocket 架构重构说明

## 概述

我们已经成功将 WebSocket 架构从"连接后认证"模式重构为"认证优先"模式，并移除了冗余的 `UserSession`，统一使用 `GlobalUserSession`。

## 主要变更

### 1. 移除冗余代码

- **删除 `UserSession`**: 旧的房间绑定式 WebSocket 会话
- **删除 `websocket_handler`**: 旧的房间专用处理器
- **移除 `JoinRoom` 消息**: 简化为只使用 `JoinRoomWithName`
- **更新路由**: 移除 `/ws/{room_id}` 路径，只保留 `/global_ws`

### 2. 统一架构优势

#### 🎯 **GlobalUserSession 的优势**

- **认证优先**: 连接时就验证用户身份
- **全局灵活**: 一个连接处理所有房间操作
- **资源高效**: 避免多连接开销
- **支持全局聊天**: 内置全局房间功能

#### 🔧 **技术改进**

- **查询参数认证**: `?user_id=xxx&username=yyy`
- **自动全局房间加入**: 连接成功后自动加入全局聊天
- **简化消息处理**: 移除复杂的 ID 映射系统
- **统一错误处理**: 更好的错误反馈机制

## 使用方式

### 前端连接示例

```javascript
// 新的统一连接方式
const ws = new WebSocket(
  `ws://localhost:3000/global_ws?user_id=${userId}&username=${username}`
);

ws.onopen = function (event) {
  console.log("WebSocket连接已建立");
};

ws.onmessage = function (event) {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "connected":
      console.log("认证成功:", data.user_id, data.username);
      break;
    case "chat_message":
      console.log("收到消息:", data);
      break;
    case "room_info":
      console.log("房间信息更新:", data);
      break;
    // 其他消息类型...
  }
};
```

### 消息格式

#### 发送消息

```javascript
// 加入房间
ws.send(
  JSON.stringify({
    type: "join_room",
    room_id: "room123",
    player_name: "Alice",
  })
);

// 发送聊天消息
ws.send(
  JSON.stringify({
    type: "chat",
    room_id: "global", // 或具体房间ID
    content: "Hello, world!",
  })
);

// 获取房间信息
ws.send(
  JSON.stringify({
    type: "get_room_info",
    room_id: "room123",
  })
);
```

#### 接收消息

```javascript
// 连接成功
{
    "type": "connected",
    "user_id": "alice",
    "username": "Alice"
}

// 聊天消息
{
    "type": "chat_message",
    "room_id": "global",
    "user_id": "bob",
    "username": "Bob",
    "content": "Hi everyone!"
}

// 房间信息更新
{
    "type": "room_info",
    "name": "房间 #123",
    "host_player_name": "Alice",
    "players": ["Alice", "Bob"],
    "player_count": 2,
    "force_start_players": [],
    "required_to_start": 2
}
```

## 迁移指南

### 对于前端开发者

1. **更新连接方式**: 使用 `/global_ws` 端点并添加查询参数
2. **统一消息处理**: 所有房间操作通过同一个连接
3. **添加房间 ID**: 在消息中明确指定 `room_id`

### 对于后端开发者

1. **移除旧端点**: 不再使用 `/ws/{room_id}`
2. **统一认证**: 查询参数验证用户身份
3. **简化消息处理**: 不需要处理 `JoinRoom` 消息

## 全局房间功能

系统自动创建 `global` 房间，用户连接后自动加入：

- **房间 ID**: `"global"`
- **用途**: 全站聊天、系统通知
- **特点**: 支持大量用户（1000 人）、永不删除

## 房间管理

- **自动清理**: 空房间 5 分钟后自动删除（全局房间除外）
- **动态创建**: 用户加入不存在的房间时自动创建
- **房主机制**: 第一个加入的用户成为房主

## 性能优化

1. **减少连接数**: 每用户一个连接替代每房间一个连接
2. **内存效率**: 移除临时 ID 映射表
3. **网络优化**: 减少连接建立开销
4. **代码简化**: 更少的处理逻辑和更清晰的架构

## 安全改进

1. **认证优先**: 未认证用户无法建立连接
2. **参数验证**: 严格验证 `user_id` 和 `username`
3. **会话管理**: 防止重复连接和身份冲突
4. **错误处理**: 更好的错误反馈和异常处理

---

## 总结

通过这次重构，我们实现了：

- ✅ 移除了 `UserSession` 的冗余代码
- ✅ 统一了 WebSocket 架构为 `GlobalUserSession`
- ✅ 简化了认证和连接流程
- ✅ 提高了系统性能和安全性
- ✅ 为全局聊天功能奠定了基础

新架构更加现代化、高效且易于维护。

import { createToaster } from "@chakra-ui/react";

// 创建 toaster 实例
const toaster = createToaster({
  placement: "top-end",
});

// 导入用户认证信息类型
interface User {
  user_id: string;
  username: string;
}

export interface ChatMessage {
  type:
    | "chat"
    | "chat_message" // 支持后端发送的聊天消息格式
    | "join_room"
    | "leave_room"
    | "change_name"
    | "system"
    | "room_info"
    | "ok"
    | "error"
    | "connected" // 认证成功消息
    | "redirect_to_home" // 重定向到首页消息
    | "change_group"; // 新增：切换组别消息
  room_id?: number | string; // 支持数字和字符串类型的房间ID
  sender_id?: number;
  player_id?: number;
  player_name?: string;
  username?: string; // 添加用户名字段用于全局聊天
  new_name?: string;
  content?: string;
  message?: string;
  reason?: string; // 重定向原因
  timestamp?: string;
  players?: [number, string][] | string[]; // 支持两种格式：[id, name]数组或用户名数组
  player_count?: number;
  force_start_players?: number[] | string[]; // 支持两种格式
  required_to_start?: number;
  // 房间信息字段（由后端room_info消息返回）
  name?: string;
  host_player_name?: string;
  admin_player_name?: string; // 新增：管理员用户名
  status?: string;
  // 新增：分组相关字段
  groups?: GroupInfo[];
  target_group_id?: number; // 切换组别时的目标组ID
}

// 新增：分组信息接口
export interface GroupInfo {
  id: number;
  players: string[]; // 只包含玩家列表，颜色和名称前端处理
}

export interface GameState {
  isConnected: boolean;
  currentPlayerId: number | null;
  currentRoomId: number | string | null; // 支持数字和字符串类型的房间ID
  roomPlayers: { id: number; name: string }[];
  forceStartCount: number;
  requiredToStart: number;
  isForcingStart: boolean;
  messages: ChatMessage[]; // 全局消息
  roomMessages: { [roomId: string]: ChatMessage[] }; // 房间消息
  currentUser: User | null; // 添加当前用户信息
  // 新增：分组相关状态
  roomGroups: { [roomId: string]: GroupInfo[] }; // 房间分组信息
  currentPlayerGroup: { [roomId: string]: number }; // 当前玩家在各房间的组别
}

type GameStateListener = (state: GameState) => void;
type MessageListener = (message: ChatMessage) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private gameState: GameState = {
    isConnected: false,
    currentPlayerId: null,
    currentRoomId: null,
    roomPlayers: [],
    forceStartCount: 0,
    requiredToStart: 0,
    isForcingStart: false,
    messages: [],
    roomMessages: {}, // 初始化房间消息
    currentUser: null, // 初始化用户信息
    roomGroups: {}, // 初始化房间分组信息
    currentPlayerGroup: {}, // 初始化玩家组别信息
  };

  private stateListeners: Set<GameStateListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private messageQueue: any[] = []; // 消息队列

  // 订阅状态变化
  subscribe(listener: GameStateListener): () => void {
    this.stateListeners.add(listener);
    // 立即调用一次，传递当前状态
    listener(this.gameState);

    // 返回取消订阅函数
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // 订阅消息
  subscribeToMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  // 通知所有监听器状态变化
  private notifyStateChange() {
    this.stateListeners.forEach((listener) => listener(this.gameState));
  }

  // 通知所有消息监听器
  private notifyMessage(message: ChatMessage) {
    this.messageListeners.forEach((listener) => listener(message));
  }

  // 更新状态
  private updateState(updates: Partial<GameState>) {
    this.gameState = { ...this.gameState, ...updates };
    this.notifyStateChange();
  }

  // 添加系统消息
  private addSystemMessage(content: string) {
    const systemMessage: ChatMessage = {
      type: "system",
      content,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.updateState({
      messages: [...this.gameState.messages, systemMessage],
    });
  }

  // 设置当前用户信息
  setCurrentUser(user: User | null) {
    this.updateState({ currentUser: user });
    if (user) {
      this.addSystemMessage(
        `👤 用户设置为: ${user.username} (${user.user_id})`
      );
    } else {
      this.addSystemMessage("👤 用户信息已清除");
    }
  }

  // 获取当前用户信息
  getCurrentUser(): User | null {
    return this.gameState.currentUser;
  }

  // 获取连接状态
  isConnected(): boolean {
    return this.gameState.isConnected;
  }

  // 连接WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 如果已经连接或正在连接，直接返回
        if (
          this.gameState.isConnected ||
          (this.ws && this.ws.readyState === WebSocket.CONNECTING)
        ) {
          console.log("WebSocket已连接或正在连接中，跳过重复连接");
          resolve();
          return;
        }

        // 如果有现有连接，先关闭
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
          console.log("关闭现有WebSocket连接");
          this.ws.close();
        }

        // 构建WebSocket URL，如果有用户信息则添加认证参数
        // 根据当前页面协议动态选择ws或wss
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host; // 使用当前页面的host（包括端口）

        let wsUrl = `${protocol}//${host}/global_ws`;

        const currentUser = this.getCurrentUser();

        if (currentUser && currentUser.user_id && currentUser.username) {
          // 使用认证参数
          const params = new URLSearchParams({
            user_id: currentUser.user_id,
            username: currentUser.username,
          });
          wsUrl += `?${params.toString()}`;
          console.log("使用认证参数连接WebSocket:", wsUrl);
        } else {
          console.warn("未找到用户信息，WebSocket连接可能失败");
        }

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.updateState({
            isConnected: true,
          });

          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.user_id && currentUser.username) {
            // 使用认证模式，等待服务器的 connected 消息
            console.log("WebSocket 连接已建立，等待认证确认...");
            this.addSystemMessage("🔄 WebSocket 连接已建立，正在进行认证...");
          } else {
            // 无认证模式（后备方案）
            this.updateState({
              currentRoomId: "global", // 默认在全局房间
            });
            this.addSystemMessage("🎉 WebSocket 连接成功！已加入全局房间");
            toaster.create({
              title: "连接成功",
              description: "WebSocket 连接已建立，已加入全局房间",
              type: "success",
              duration: 3000,
            });
          }

          // 处理队列中的消息
          this.processMessageQueue();

          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = () => {
          this.updateState({
            isConnected: false,
            currentPlayerId: null,
            // 不要重置currentRoomId，保持用户的房间状态
            // currentRoomId: null,
            roomPlayers: [],
            forceStartCount: 0,
            requiredToStart: 0,
            isForcingStart: false,
          });
          this.ws = null;
          this.addSystemMessage("🔌 WebSocket 连接已关闭");
          toaster.create({
            title: "连接断开",
            description: "WebSocket 连接已断开",
            type: "warning",
            duration: 3000,
          });
        };

        this.ws.onerror = (error) => {
          this.addSystemMessage(`❌ WebSocket 错误: ${error}`);
          toaster.create({
            title: "连接错误",
            description: "WebSocket 连接失败",
            type: "error",
            duration: 3000,
          });
          reject(error);
        };
      } catch (error) {
        this.addSystemMessage(`❌ 连接失败: ${error}`);
        reject(error);
      }
    });
  }

  // 断开连接
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  // 处理接收到的消息
  private handleMessage(event: MessageEvent) {
    try {
      const message: ChatMessage = JSON.parse(event.data);
      message.timestamp = new Date().toLocaleTimeString();

      // 通知消息监听器
      this.notifyMessage(message);

      // 处理不同类型的消息
      switch (message.type) {
        case "connected":
          // 处理认证成功消息
          this.handleConnected(message);
          break;
        case "chat_message":
          // 处理后端发送的聊天消息
          this.handleChatMessage(message);
          break;
        case "room_info":
          this.handleRoomInfo(message);
          break;
        case "ok":
          toaster.create({
            title: "操作成功",
            description: "操作已成功执行",
            type: "success",
            duration: 2000,
          });
          break;
        case "error":
          toaster.create({
            title: "操作失败",
            description: message.message || "发生未知错误",
            type: "error",
            duration: 4000,
          });
          break;
        case "join_room":
          this.handleJoinRoom(message);
          break;
        case "leave_room":
          this.handleLeaveRoom(message);
          break;
        case "redirect_to_home":
          this.handleRedirectToHome(message);
          break;
        case "change_name":
          this.handleChangeName(message);
          break;
        default:
          // 其他消息类型添加到聊天历史中
          this.updateState({
            messages: [...this.gameState.messages, message],
          });
          break;
      }

      // 如果是第一次连接时的欢迎消息，提取 player_id
      if (
        message.type === "join_room" &&
        message.player_id &&
        !this.gameState.currentPlayerId &&
        message.room_id === 1 // 只有在默认房间1的加入消息才设置玩家ID
      ) {
        this.updateState({
          currentPlayerId: message.player_id,
          currentRoomId: message.room_id || 1,
        });
        // 获取房间玩家信息
        this.send({
          type: "get_room_info",
          room_id: message.room_id,
        });
      }
    } catch (error) {
      this.addSystemMessage(`❌ 消息解析错误: ${event.data}`);
    }
  }

  // 处理连接成功消息
  private handleConnected(message: ChatMessage) {
    console.log("WebSocket 认证成功:", message);
    this.addSystemMessage("🎉 WebSocket 认证成功！已自动加入全局房间");
    toaster.create({
      title: "认证成功",
      description: "WebSocket 连接已建立并通过认证",
      type: "success",
      duration: 3000,
    });

    // 设置当前房间为全局房间
    this.updateState({
      currentRoomId: "global",
    });
  }

  // 处理聊天消息
  private handleChatMessage(message: ChatMessage) {
    // 将聊天消息添加到消息历史中
    const chatMessage: ChatMessage = {
      ...message,
      timestamp: new Date().toLocaleTimeString(),
    };

    // 根据房间ID分类存储消息
    if (message.room_id === "global") {
      // 全局消息存储到主消息列表
      this.updateState({
        messages: [...this.gameState.messages, chatMessage],
      });
    } else if (message.room_id) {
      // 房间消息存储到对应房间
      this.addRoomMessage(String(message.room_id), chatMessage);
    }

    // 通知消息监听器
    this.notifyMessage(chatMessage);
  }

  // 处理房间信息
  private handleRoomInfo(message: ChatMessage) {
    const updates: Partial<GameState> = {};
    console.log("收到groups:", message.groups);
    // 直接从message中获取房间信息，不需要解析content
    console.log("处理房间信息:", message);

    // 处理玩家列表 - 后端返回的是字符串数组
    if (Array.isArray(message.players)) {
      if (typeof message.players[0] === "string") {
        // 新格式：字符串数组
        updates.roomPlayers = (message.players as string[]).map(
          (name, index) => ({
            id: index,
            name: name,
          })
        );
      } else {
        // 旧格式：[id, name]数组
        updates.roomPlayers = (message.players as [number, string][]).map(
          ([id, name]) => ({ id, name })
        );
      }
    }

    // 处理强制开始玩家列表
    if (message.force_start_players) {
      if (Array.isArray(message.force_start_players)) {
        updates.forceStartCount = message.force_start_players.length;
        // 这里需要根据实际的ID类型进行匹配，暂时跳过
        updates.isForcingStart = false;
      }
    }

    if (message.required_to_start) {
      updates.requiredToStart = message.required_to_start;
    }

    // 处理分组信息
    if (
      message.groups &&
      (message.room_id !== undefined || this.gameState.currentRoomId)
    ) {
      console.log(message.room_id);
      // 优先使用 message.room_id，其次用当前状态
      const roomId =
        message.room_id !== undefined && message.room_id !== null
          ? String(message.room_id)
          : String(this.gameState.currentRoomId);
      console.log("当前房间ID:", roomId);
      // 创建新的 roomGroups 对象，保证响应式
      const newRoomGroups = {
        ...this.gameState.roomGroups,
        [roomId]: message.groups,
      };
      updates.roomGroups = newRoomGroups;
      console.log("123:" + JSON.stringify(newRoomGroups));

      // 查找当前用户在哪个组
      if (this.gameState.currentUser) {
        const currentUsername = this.gameState.currentUser.username;
        for (const group of message.groups) {
          if (group.players.includes(currentUsername)) {
            this.gameState.currentPlayerGroup[roomId] = group.id;
            break;
          }
        }
      }
    }

    this.updateState(updates);
  }

  // 处理加入房间
  private handleJoinRoom(message: ChatMessage) {
    const newMessage = { ...message };
    this.updateState({
      messages: [...this.gameState.messages, newMessage],
    });

    if (message.player_id === this.gameState.currentPlayerId) {
      this.updateState({
        currentRoomId: message.room_id || null,
        isForcingStart: false,
        forceStartCount: 0,
        requiredToStart: 0,
      });
      if (message.room_id !== undefined && message.room_id !== null) {
        this.gameState.roomGroups[String(message.room_id)] = Array.from(
          { length: 9 },
          (_, id) => ({
            id,
            players: [],
          })
        );
      }
      toaster.create({
        title: "加入房间成功",
        description: `已加入房间 ${message.room_id}`,
        type: "success",
        duration: 3000,
      });
      // 加入房间后主动获取房间玩家信息
      this.send({
        type: "get_room_info",
        room_id: message.room_id,
      });
    } else {
      toaster.create({
        title: "新玩家加入",
        description: `${message.player_name} 加入了房间`,
        type: "info",
        duration: 2000,
      });
      // 有玩家加入也刷新房间玩家信息
      this.send({
        type: "get_room_info",
        room_id: message.room_id,
      });
    }
  }

  // 处理离开房间
  private handleLeaveRoom(message: ChatMessage) {
    const newMessage = { ...message };
    this.updateState({
      messages: [...this.gameState.messages, newMessage],
    });

    if (message.player_id === this.gameState.currentPlayerId) {
      this.updateState({
        currentRoomId: null,
        isForcingStart: false,
        forceStartCount: 0,
        requiredToStart: 0,
        roomPlayers: [],
      });
      toaster.create({
        title: "离开房间",
        description: `已离开房间 ${message.room_id}`,
        type: "warning",
        duration: 3000,
      });
    }
    // 有玩家离开也刷新房间玩家信息
    if (message.room_id && this.gameState.currentRoomId === message.room_id) {
      this.send({
        type: "get_room_info",
        room_id: message.room_id,
      });
    }
  }

  // 处理重定向到首页
  private handleRedirectToHome(message: ChatMessage) {
    console.log("收到重定向到首页的消息:", message);

    // 显示提示消息
    let description = "您将被重定向到首页";
    if (message.reason === "kicked_from_room") {
      description = "您已被踢出房间，将返回首页";
    }

    toaster.create({
      title: "重定向通知",
      description: description,
      type: "warning",
      duration: 3000,
    });

    // 清空当前房间状态
    this.updateState({
      currentRoomId: null,
      isForcingStart: false,
      forceStartCount: 0,
      requiredToStart: 0,
      roomPlayers: [],
    });

    // 延迟跳转，给用户时间看到提示
    setTimeout(() => {
      // 如果在React Router环境中，执行页面跳转
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }, 1000);
  }

  // 处理更改名称
  private handleChangeName(message: ChatMessage) {
    const newMessage = { ...message };
    this.updateState({
      messages: [...this.gameState.messages, newMessage],
    });

    if (message.player_id === this.gameState.currentPlayerId) {
      toaster.create({
        title: "名称已更改",
        description: `名称已更改为: ${message.new_name}`,
        type: "success",
        duration: 3000,
      });
    }
    // 有玩家更名也刷新房间玩家信息
    if (this.gameState.currentRoomId) {
      this.send({
        type: "get_room_info",
        room_id: this.gameState.currentRoomId,
      });
    }
  }

  // 发送消息
  send(message: any) {
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.gameState.isConnected
    ) {
      this.ws.send(JSON.stringify(message));
      return true;
    }

    // 如果WebSocket正在连接中，将消息加入队列
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      console.log("WebSocket正在连接中，消息已加入队列:", message);
      this.messageQueue.push(message);
      return true;
    }

    // 如果WebSocket未连接，记录错误并尝试重连
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket未连接，消息未发送:", message);
      if (!this.gameState.isConnected) {
        console.log("尝试重新连接WebSocket...");
        this.connect().catch(console.error);
      }
    }
    return false;
  }

  // 处理队列中的消息
  private processMessageQueue() {
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.gameState.isConnected
    ) {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        this.ws.send(JSON.stringify(message));
        console.log("从队列发送消息:", message);
      }
    }
  }

  // 发送聊天消息
  sendChat(content: string, roomId?: string | number) {
    const targetRoomId = roomId || this.gameState.currentRoomId || "global";

    return this.send({
      type: "chat",
      room_id: targetRoomId,
      content,
    });
  }

  // 加入房间
  joinRoom(roomId: string | number, playerName?: string, password?: string) {
    const currentUser = this.getCurrentUser();
    const playerNameToUse = playerName || currentUser?.username || "Unknown";

    // 如果已经在其他房间（但不是global房间），先离开当前房间
    if (
      this.gameState.currentRoomId &&
      this.gameState.currentRoomId !== roomId &&
      this.gameState.currentRoomId !== "global" // 添加这个条件，不离开global房间
    ) {
      this.send({
        type: "leave_room",
        room_id: this.gameState.currentRoomId,
      });
      this.addSystemMessage(`🚪 离开房间 ${this.gameState.currentRoomId}`);
      // 等待后端处理后再加入新房间，防止room_id错误
      setTimeout(() => {
        this.send({
          type: "join_room",
          room_id: roomId,
          player_name: playerNameToUse,
          password: password, // 发送密码
        });
        this.addSystemMessage(`🚪 尝试加入房间 ${roomId}`);
      }, 100);
    } else {
      this.send({
        type: "join_room",
        room_id: roomId,
        player_name: playerNameToUse,
        password: password, // 发送密码
      });
      this.addSystemMessage(`🚪 尝试加入房间 ${roomId}`);
    }
  }

  // 离开房间
  leaveRoom() {
    if (
      this.gameState.currentRoomId &&
      this.gameState.currentRoomId !== "global"
    ) {
      this.send({
        type: "leave_room",
        room_id: this.gameState.currentRoomId,
      });
      this.addSystemMessage(`🚪 离开房间 ${this.gameState.currentRoomId}`);

      // 离开特定房间后自动返回全局房间
      this.updateState({
        currentRoomId: "global",
      });
    }
  }

  // 更改名称
  changeName(newName: string) {
    if (this.gameState.currentPlayerId) {
      this.send({ type: "change_name", new_name: newName });
      this.addSystemMessage(`👤 尝试更改名称为: ${newName}`);
      return true;
    }
    return false;
  }

  // 切换强制开始
  toggleForceStart() {
    const messageType = this.gameState.isForcingStart
      ? "deforce_start"
      : "force_start";
    this.send({
      type: messageType,
      room_id: this.gameState.currentRoomId || "global",
    });
    this.addSystemMessage(`🚀 尝试: ${messageType}`);
  }

  // 发送移动消息
  sendMove(direction: string) {
    this.send({
      type: "move",
      direction: direction,
      from: { x: 10, y: 20 },
    });
    this.addSystemMessage(`🚶 发送移动: ${direction}`);
  }

  // 切换组别
  changeGroup(roomId: string | number, targetGroupId: number) {
    this.send({
      type: "change_group",
      room_id: roomId,
      target_group_id: targetGroupId,
    });
    console.log(`发送切换组别请求: 房间 ${roomId}, 目标组 ${targetGroupId}`);
  }

  // 获取房间分组信息
  getRoomGroups(roomId: string): GroupInfo[] {
    console.log("获取房间分组信息请求:", this.gameState.roomGroups);
    console.log("获取房间分组信息:", roomId, this.gameState.roomGroups[roomId]);
    return this.gameState.roomGroups[roomId] || [];
  }

  // 获取当前玩家在指定房间的组别
  getCurrentPlayerGroup(roomId: string): number | null {
    return this.gameState.currentPlayerGroup[roomId] || null;
  }

  // 清空消息
  clearMessages() {
    this.updateState({ messages: [] });
  }

  // 添加房间消息
  addRoomMessage(roomId: string, message: ChatMessage) {
    const roomMessages = { ...this.gameState.roomMessages };
    if (!roomMessages[roomId]) {
      roomMessages[roomId] = [];
    }
    roomMessages[roomId] = [...roomMessages[roomId], message];
    this.updateState({ roomMessages });
  }

  // 获取房间消息
  getRoomMessages(roomId: string): ChatMessage[] {
    return this.gameState.roomMessages[roomId] || [];
  }

  // 清空房间消息
  clearRoomMessages(roomId: string) {
    const roomMessages = { ...this.gameState.roomMessages };
    roomMessages[roomId] = [];
    this.updateState({ roomMessages });
  }

  // 获取当前状态
  getState(): GameState {
    return this.gameState;
  }
}

// 创建单例实例
export const wsManager = new WebSocketManager();

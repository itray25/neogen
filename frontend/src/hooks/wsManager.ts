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
    | "join_room"
    | "leave_room"
    | "change_name"
    | "system"
    | "room_info"
    | "ok"
    | "error";
  room_id?: number;
  sender_id?: number;
  player_id?: number;
  player_name?: string;
  new_name?: string;
  content?: string;
  message?: string;
  timestamp?: string;
  players?: [number, string][];
  player_count?: number;
  force_start_players?: number[];
  required_to_start?: number;
}

export interface GameState {
  isConnected: boolean;
  currentPlayerId: number | null;
  currentRoomId: number | null;
  roomPlayers: { id: number; name: string }[];
  forceStartCount: number;
  requiredToStart: number;
  isForcingStart: boolean;
  messages: ChatMessage[];
  currentUser: User | null; // 添加当前用户信息
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
    currentUser: null, // 初始化用户信息
  };

  private stateListeners: Set<GameStateListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();

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

  // 连接WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket("ws://localhost:3000/ws");

        this.ws.onopen = () => {
          this.updateState({
            isConnected: true,
            currentRoomId: 1, // 默认加入房间1
          });
          this.addSystemMessage("🎉 WebSocket 连接成功！自动加入房间1");
          toaster.create({
            title: "连接成功",
            description: "WebSocket 连接已建立，已自动加入房间1",
            type: "success",
            duration: 3000,
          });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = () => {
          this.updateState({
            isConnected: false,
            currentPlayerId: null,
            currentRoomId: null,
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

  // 处理房间信息
  private handleRoomInfo(message: ChatMessage) {
    const updates: Partial<GameState> = {};

    if (Array.isArray(message.players)) {
      updates.roomPlayers = message.players.map(([id, name]) => ({ id, name }));
    }

    if (message.force_start_players) {
      updates.forceStartCount = message.force_start_players.length;
      if (
        this.gameState.currentPlayerId &&
        message.force_start_players.includes(this.gameState.currentPlayerId)
      ) {
        updates.isForcingStart = true;
      } else {
        updates.isForcingStart = false;
      }
    }

    if (message.required_to_start) {
      updates.requiredToStart = message.required_to_start;
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
    if (this.ws && this.gameState.isConnected) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  // 发送聊天消息
  sendChat(content: string) {
    if (this.send({ type: "chat", content })) {
      this.addSystemMessage(`📤 发送: ${content}`);
      return true;
    }
    return false;
  }

  // 加入房间
  joinRoom(roomId: number) {
    // 如果已经在其他房间，先离开当前房间
    if (
      this.gameState.currentRoomId &&
      this.gameState.currentRoomId !== roomId
    ) {
      this.send({
        type: "leave_room",
        room_id: this.gameState.currentRoomId,
        player_id: this.gameState.currentPlayerId,
      });
      this.addSystemMessage(`🚪 离开房间 ${this.gameState.currentRoomId}`);
      // 等待后端处理后再加入新房间，防止room_id错误
      setTimeout(() => {
        this.send({ type: "join_room", room_id: roomId });
        this.addSystemMessage(`🚪 尝试加入房间 ${roomId}`);
      }, 100);
    } else {
      this.send({ type: "join_room", room_id: roomId });
      this.addSystemMessage(`🚪 尝试加入房间 ${roomId}`);
    }
  }

  // 离开房间
  leaveRoom() {
    if (this.gameState.currentRoomId && this.gameState.currentPlayerId) {
      this.send({
        type: "leave_room",
        room_id: this.gameState.currentRoomId,
        player_id: this.gameState.currentPlayerId,
      });
      this.addSystemMessage(`🚪 离开房间 ${this.gameState.currentRoomId}`);
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
    this.send({ type: messageType });
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

  // 清空消息
  clearMessages() {
    this.updateState({ messages: [] });
  }

  // 获取当前状态
  getState(): GameState {
    return this.gameState;
  }
}

// 创建单例实例
export const wsManager = new WebSocketManager();

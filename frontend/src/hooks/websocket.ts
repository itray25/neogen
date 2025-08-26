import { useState, useEffect } from "react";
import { wsManager, GameState, ChatMessage } from "./wsManager";

export function useWebSocket() {
  const [gameState, setGameState] = useState<GameState>(wsManager.getState());

  useEffect(() => {
    // 订阅状态变化
    const unsubscribe = wsManager.subscribe(setGameState);

    // 清理函数
    return unsubscribe;
  }, []);

  return {
    gameState,
    connect: () => wsManager.connect(),
    disconnect: () => wsManager.disconnect(),
    sendChat: (content: string) => wsManager.sendChat(content),
    joinRoom: (roomId: number) => wsManager.joinRoom(roomId),
    leaveRoom: () => wsManager.leaveRoom(),
    changeName: (newName: string) => wsManager.changeName(newName),
    toggleForceStart: () => wsManager.toggleForceStart(),
    sendMove: (direction: string) => wsManager.sendMove(direction),
    clearMessages: () => wsManager.clearMessages(),
  };
}

export function useWebSocketMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const unsubscribe = wsManager.subscribeToMessages((message) => {
      setMessages((prev) => [...prev, message]);
    });

    return unsubscribe;
  }, []);

  return messages;
}

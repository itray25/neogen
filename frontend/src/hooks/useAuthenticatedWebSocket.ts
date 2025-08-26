import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { wsManager } from "./wsManager";
import { useWebSocket } from "./websocket";

/**
 * 集成认证和WebSocket的Hook
 * 自动在用户登录时设置WebSocket的用户信息
 */
export const useAuthenticatedWebSocket = () => {
  const { user, isAuthenticated } = useAuth();
  const webSocketHook = useWebSocket();

  // 当用户认证状态变化时，更新WebSocket管理器的用户信息
  useEffect(() => {
    if (isAuthenticated && user) {
      wsManager.setCurrentUser(user);
    } else {
      wsManager.setCurrentUser(null);
    }
  }, [isAuthenticated, user]);

  return {
    ...webSocketHook,
    currentUser: user,
    isAuthenticated,
  };
};

import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { wsManager } from "./wsManager";
import { useWebSocket } from "./websocket";

/**
 * 集成认证和WebSocket的Hook
 * 自动在用户登录时设置WebSocket的用户信息并建立连接
 */
export const useAuthenticatedWebSocket = () => {
  const { user, isAuthenticated } = useAuth();
  const webSocketHook = useWebSocket();

  // 当用户认证状态变化时，更新WebSocket管理器的用户信息
  useEffect(() => {
    console.log("useAuthenticatedWebSocket effect triggered", {
      isAuthenticated,
      user,
    });

    if (isAuthenticated && user) {
      wsManager.setCurrentUser(user);

      // 如果WebSocket未连接，则建立连接
      if (!wsManager.isConnected()) {
        console.log("尝试建立WebSocket连接...");
        wsManager
          .connect()
          .then(() => {
            console.log("WebSocket连接建立成功");
            // 注意：不在这里发送set_user_info，因为连接已经包含了认证参数
            // 服务器会自动处理认证，我们等待 'connected' 消息确认
          })
          .catch((error) => {
            console.error("WebSocket连接失败:", error);
          });
      } else {
        console.log("WebSocket已连接，跳过重复连接");
        // 如果已连接，也不需要重复发送用户信息，
        // 因为连接建立时已经包含了认证参数
      }
    } else {
      console.log("用户未认证，清除用户信息并断开连接");
      wsManager.setCurrentUser(null);
      // 用户登出时断开连接
      if (wsManager.isConnected()) {
        wsManager.disconnect();
      }
    }
  }, [isAuthenticated, user?.user_id]); // 只在认证状态和用户ID变化时触发

  return {
    ...webSocketHook,
    currentUser: user,
    isAuthenticated,
  };
};

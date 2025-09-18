import React from "react";
import { useLocation, useParams } from "react-router-dom";
import MultiChat from "./MultiChatV2";

const GlobalChatWrapper: React.FC = () => {
  const location = useLocation();
  const params = useParams();

  // 根据当前路径决定聊天上下文
  const getChatContext = (): "global" | "room" | "game" => {
    if (location.pathname.includes("/game")) {
      return "game";
    } else if (location.pathname.includes("/rooms/")) {
      return "room";
    }
    return "global";
  };

  // 获取房间ID
  const getRoomId = (): string | undefined => {
    if (location.pathname.includes("/rooms/")) {
      // 从 URL 路径中提取房间ID，例如 /rooms/123 或 /rooms/123/game
      const match = location.pathname.match(/\/rooms\/([^/]+)/);
      return match ? match[1] : undefined;
    }
    return undefined;
  };

  const context = getChatContext();
  const roomId = getRoomId();

  // 只在主页、房间列表页显示全局聊天，其他页面由页面内组件控制
  if (
    context === "global" &&
    (location.pathname === "/" || location.pathname === "/room")
  ) {
    return <MultiChat />;
  }

  // 房间页和游戏页不在这里显示聊天，由各自页面组件控制
  return null;
};

export default GlobalChatWrapper;

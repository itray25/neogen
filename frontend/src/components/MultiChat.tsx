import React, { useState, useEffect, useRef } from "react";
import {
  HiOutlineChatBubbleLeftEllipsis,
  HiOutlineXMark,
  HiOutlineGlobeAlt,
  HiOutlineUsers,
} from "react-icons/hi2";
import { IoGameControllerOutline } from "react-icons/io5";
import { useAuth } from "../contexts/AuthContext";
import { wsManager, GameState } from "../hooks/wsManager";

interface ChatMessage {
  username: string;
  content: string;
  timestamp: Date;
  context: "global" | "room" | "game";
}

interface MultiChatProps {
  roomId?: string;
  gameState?: GameState | null;
}

const MultiChat: React.FC<MultiChatProps> = ({ roomId, gameState }) => {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"global" | "room" | "game">(
    "global"
  );
  const [currentMessage, setCurrentMessage] = useState("");
  const [messages, setMessages] = useState<{
    global: ChatMessage[];
    room: ChatMessage[];
    game: ChatMessage[];
  }>({
    global: [],
    room: [],
    game: [],
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 判断游戏是否已开始
  const isGameStarted = () => {
    return (
      gameState && gameState.roomPlayers && gameState.roomPlayers.length > 0
    );
  };

  useEffect(() => {
    const unsubscribe = wsManager.subscribeToMessages((message) => {
      if (message.type === "chat" || message.type === "chat_message") {
        const newMessage: ChatMessage = {
          username: message.username || message.player_name || "Unknown",
          content: message.message || message.content || "",
          timestamp: new Date(),
          context: (message as any).context || "global",
        };

        setMessages((prev) => ({
          ...prev,
          [newMessage.context]: [...prev[newMessage.context], newMessage],
        }));
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = () => {
    if (!currentMessage.trim() || !user) return;

    const message = {
      type: "chat",
      message: currentMessage,
      username: user.username,
      context: activeTab,
      room_id: roomId,
    };

    wsManager.send(message);
    setCurrentMessage("");
  };

  // 获取tab配置
  const getTabConfig = (tab: "global" | "room" | "game") => {
    const gameStarted = isGameStarted();

    switch (tab) {
      case "global":
        return {
          icon: HiOutlineGlobeAlt,
          label: "全局",
          color: "#667EEA",
          disabled: false,
        };
      case "room":
        return {
          icon: HiOutlineUsers,
          label: "房间",
          color: "#10B981",
          disabled: !roomId,
        };
      case "game":
        return {
          icon: IoGameControllerOutline,
          label: "游戏",
          color: "#8B5CF6",
          disabled: !roomId || !gameStarted,
        };
    }
  };

  // 获取未读消息数量
  const getUnreadCount = (tab: "global" | "room" | "game") => {
    if (tab === "game" && !isGameStarted()) return 0;
    return messages[tab].length;
  };

  // 获取可用的标签列表
  const getAvailableTabs = () => {
    const tabs: ("global" | "room" | "game")[] = ["global"];
    if (roomId) {
      tabs.push("room");
      if (isGameStarted()) {
        tabs.push("game");
      }
    }
    return tabs;
  };

  // 计算总未读消息数
  const totalUnreadCount = Object.values(messages).reduce(
    (total, msgArray) => total + msgArray.length,
    0
  );

  if (!isAuthenticated) {
    return null;
  }

  const currentMessages = messages[activeTab] || [];
  const availableTabs = getAvailableTabs();

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      {/* Chat 按钮和标签容器 */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* 标签列表 */}
        {availableTabs.map((tab) => {
          const config = getTabConfig(tab);
          const unreadCount = getUnreadCount(tab);
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              disabled={config.disabled}
              style={{
                padding: "8px 12px",
                backgroundColor: isActive
                  ? config.color
                  : "rgba(255, 255, 255, 0.1)",
                color: isActive ? "#fff" : "#e2e8f0",
                border: `1px solid ${isActive ? config.color : "rgba(255, 255, 255, 0.2)"}`,
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: config.disabled ? "not-allowed" : "pointer",
                opacity: config.disabled ? 0.5 : 1,
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                position: "relative",
              }}
            >
              <config.icon size={14} />
              {config.label}
              {unreadCount > 0 && (
                <span
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    borderRadius: "50%",
                    fontSize: "10px",
                    fontWeight: "bold",
                    minWidth: "16px",
                    height: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: "4px",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Chat 主按钮 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            backgroundColor: "#4A5568",
            color: "#fff",
            border: "1px solid #2D3748",
            borderRadius: "50%",
            width: "48px",
            height: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
            position: "relative",
          }}
        >
          {isOpen ? (
            <HiOutlineXMark size={20} />
          ) : (
            <HiOutlineChatBubbleLeftEllipsis size={20} />
          )}
          {totalUnreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                background: "#ef4444",
                color: "#fff",
                borderRadius: "50%",
                fontSize: "10px",
                fontWeight: "bold",
                minWidth: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Chat 面板 */}
      {isOpen && (
        <div
          style={{
            width: "320px",
            height: "400px",
            backgroundColor: "rgba(26, 32, 44, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            marginTop: "8px",
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(10px)",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
          }}
        >
          {/* 头部 */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{ color: "#fff", fontSize: "14px", fontWeight: "600" }}
            >
              {getTabConfig(activeTab).label}聊天
            </span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#a0aec0",
                cursor: "pointer",
                padding: "2px",
              }}
            >
              <HiOutlineXMark size={16} />
            </button>
          </div>

          {/* 消息列表 */}
          <div
            style={{
              flex: 1,
              padding: "12px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {currentMessages.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#a0aec0",
                  fontSize: "13px",
                }}
              >
                还没有消息
              </div>
            ) : (
              currentMessages.map((message, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: "13px",
                    color: "#e2e8f0",
                    lineHeight: "1.4",
                  }}
                >
                  <span style={{ color: "#63b3ed", fontWeight: "500" }}>
                    {message.username}:
                  </span>{" "}
                  {message.content}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框 */}
          <div
            style={{
              padding: "12px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
              placeholder={`发送${getTabConfig(activeTab).label}消息...`}
              style={{
                width: "100%",
                padding: "8px 12px",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiChat;

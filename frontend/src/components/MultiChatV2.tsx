import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useLocation } from "react-router-dom";
import { HiOutlineGlobeAlt, HiOutlineUsers } from "react-icons/hi2";
import { IoGameControllerOutline } from "react-icons/io5";
import { useAuth } from "../contexts/AuthContext";
import { wsManager, GameState } from "../hooks/wsManager";
import type { ChatMessage } from "../hooks/wsManager";

interface MultiChatProps {
  roomId?: string;
  gameState?: GameState | null;
}

export interface MultiChatRef {
  focusInput: () => void;
  blurInput: () => void;
  isInputFocused: () => boolean;
}

const MultiChat = forwardRef<MultiChatRef, MultiChatProps>(
  ({ roomId, gameState }, ref) => {
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(true);
    const [activeContext, setActiveContext] = useState<"global" | "room">(
      "global"
    );
    const [messages, setMessages] = useState<{
      global: ChatMessage[];
      room: ChatMessage[];
    }>({
      global: [],
      room: [],
    });
    const [inputMessage, setInputMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 暴露给父组件的方法
    useImperativeHandle(ref, () => ({
      focusInput: () => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      },
      blurInput: () => {
        if (inputRef.current) {
          inputRef.current.blur();
        }
      },
      isInputFocused: () => {
        return document.activeElement === inputRef.current;
      },
    }));

    // 判断游戏是否已开始
    const isGameStarted = () => {
      // 通过检查当前是否在游戏页面来判断是否在游戏中
      return (
        window.location.pathname.includes("/game") &&
        gameState &&
        gameState.currentRoomId
      );
    };

    // 获取可用的聊天上下文
    const getAvailableContexts = () => {
      const contexts: ("global" | "room")[] = ["global"];
      if (roomId) {
        contexts.push("room");
      }
      return contexts;
    };

    // 自动切换聊天上下文（优化逻辑）
    useEffect(() => {
      const availableContexts = getAvailableContexts();
      const currentPath = location.pathname;

      // 如果当前上下文不可用，切换到第一个可用的上下文
      if (!availableContexts.includes(activeContext)) {
        console.log("当前上下文不可用，切换到:", availableContexts[0]);
        setActiveContext(availableContexts[0]);
        return;
      }

      // 当进入房间页面或游戏页面时，且roomId发生变化时，自动切换到房间聊天
      if (
        roomId &&
        (currentPath.includes("/room/") || currentPath.includes("/game")) &&
        availableContexts.includes("room") &&
        activeContext === "global" // 只有当前是全局聊天时才自动切换
      ) {
        console.log("进入房间页面，自动切换到房间聊天");
        setActiveContext("room");
        return;
      }

      // 如果离开了房间/游戏页面，切换回全局聊天
      if (
        !currentPath.includes("/room/") &&
        !currentPath.includes("/game") &&
        activeContext !== "global"
      ) {
        console.log("离开房间页面，自动切换回全局聊天");
        setActiveContext("global");
      }
    }, [roomId, location.pathname]); // 移除gameState依赖，减少不必要的触发

    // 订阅wsManager状态变化来获取消息
    useEffect(() => {
      if (!isAuthenticated) return;

      const unsubscribeState = wsManager.subscribe((gameState: GameState) => {
        // 处理全局消息
        const globalMessages = gameState.messages.filter(
          (msg: ChatMessage) =>
            msg.room_id === "global" ||
            msg.type === "system" ||
            (!msg.room_id && msg.type === "chat")
        );

        // 处理房间消息（包含游戏中的消息，添加特殊标识）
        const roomMessages = roomId ? gameState.roomMessages[roomId] || [] : [];
        const processedRoomMessages = roomMessages.map((msg: ChatMessage) => ({
          ...msg,
          isInGame: isGameStarted(), // 添加游戏中标识
        }));

        // 设置消息状态
        setMessages((prev) => ({
          global: globalMessages,
          room: processedRoomMessages,
        }));
      });

      return unsubscribeState;
    }, [isAuthenticated, roomId]);

    // 自动滚动到最新消息
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, activeContext]);

    // 发送消息
    const handleSendMessage = () => {
      if (!inputMessage.trim() || !user) return;

      const messageData = {
        type: "chat",
        room_id: activeContext === "global" ? "global" : roomId,
        sender_id: user.user_id,
        username: user.username,
        content: inputMessage.trim(),
        isInGame: activeContext === "room" && isGameStarted(), // 标识是否在游戏中发送
      };

      wsManager.send(messageData);
      setInputMessage("");

      // 发送完消息后自动取消focus
      if (inputRef.current) {
        inputRef.current.blur();
      }
    };

    // 处理回车键发送
    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    };

    // 格式化时间
    const formatTime = (timestamp?: string) => {
      if (!timestamp) {
        return new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      let date: Date;
      if (timestamp.includes(":") && !timestamp.includes("T")) {
        return timestamp;
      } else {
        date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          date = new Date();
        }
      }

      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    // 获取上下文配置
    const getContextConfig = (context: "global" | "room") => {
      switch (context) {
        case "global":
          return { label: "全局", color: "#667EEA", icon: HiOutlineGlobeAlt };
        case "room":
          return {
            label: isGameStarted() ? "房间 [游戏中]" : "房间",
            color: isGameStarted() ? "#8B5CF6" : "#10B981",
            icon: HiOutlineUsers,
          };
      }
    };

    // 获取当前上下文的消息
    const currentMessages = messages[activeContext] || [];
    const availableContexts = getAvailableContexts();
    const currentConfig = getContextConfig(activeContext);

    // 如果用户未认证，不显示聊天组件
    if (!isAuthenticated) {
      return null;
    }

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
        {/* 整个聊天框 */}
        {isOpen && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            {/* 聊天上下文切换按钮 */}
            {availableContexts.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  marginBottom: "4px",
                }}
              >
                {availableContexts.map((context) => {
                  const config = getContextConfig(context);
                  const isActive = activeContext === context;
                  const contextMessages = messages[context] || [];

                  return (
                    <button
                      key={context}
                      onClick={() => setActiveContext(context)}
                      style={{
                        background: isActive
                          ? `linear-gradient(135deg, ${config.color} 0%, ${config.color}88 100%)`
                          : "rgba(255, 255, 255, 0.9)",
                        border: `1px solid ${isActive ? config.color : "#E5E7EB"}`,
                        borderRadius: "6px",
                        padding: "4px 8px",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: "600",
                        color: isActive ? "white" : "#374151",
                        transition: "all 0.2s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        position: "relative",
                        boxShadow: isActive
                          ? `0 2px 8px ${config.color}40`
                          : "0 1px 3px rgba(0, 0, 0, 0.1)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.borderColor = config.color;
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.borderColor = "#E5E7EB";
                          e.currentTarget.style.transform = "translateY(0)";
                        }
                      }}
                    >
                      <config.icon size={14} />
                      {config.label}
                      {contextMessages.length > 0 && (
                        <span
                          style={{
                            background: isActive
                              ? "rgba(255,255,255,0.3)"
                              : config.color,
                            color: isActive ? "white" : "white",
                            borderRadius: "50%",
                            fontSize: "8px",
                            fontWeight: "bold",
                            minWidth: "14px",
                            height: "14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: "2px",
                          }}
                        >
                          {contextMessages.length > 99
                            ? "99+"
                            : contextMessages.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 消息显示区域 */}
            {currentMessages.length > 0 && (
              <div
                style={{
                  marginBottom: "4px",
                  width: "280px",
                  maxHeight: currentMessages.length > 8 ? "240px" : "auto",
                  overflowY: currentMessages.length > 8 ? "auto" : "visible",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {currentMessages.slice(-15).map((message, index) => (
                  <div
                    key={`${message.timestamp}-${index}`}
                    style={{
                      animation:
                        index === currentMessages.slice(-15).length - 1
                          ? "slideInUp 0.2s ease-out"
                          : "none",
                    }}
                  >
                    {message.type === "system" ||
                    message.username === "系统" ? (
                      <div
                        style={{
                          fontSize: "11px",
                          color: currentConfig.color,
                          fontStyle: "italic",
                          textAlign: "center",
                          padding: "4px 8px",
                          backgroundColor: `${currentConfig.color}1A`,
                          borderLeft: `3px solid ${currentConfig.color}`,
                          marginBottom: "1px",
                        }}
                      >
                        {message.content}
                      </div>
                    ) : (
                      <div
                        style={{
                          backgroundColor: "rgba(255, 255, 255, 0.95)",
                          padding: "6px 8px",
                          borderLeft: `3px solid ${currentConfig.color}`,
                          borderRadius: "0 4px 4px 0",
                          marginBottom: "1px",
                          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                          backdropFilter: "blur(8px)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: "600",
                              color: "#1F2937",
                              fontSize: "11px",
                              marginRight: "6px",
                            }}
                          >
                            {(message as any).isInGame && "[游戏] "}
                            {message.username || "匿名用户"}:
                          </span>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#374151",
                              wordBreak: "break-word",
                            }}
                          >
                            {message.content}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "9px",
                            color: "#9CA3AF",
                            flexShrink: 0,
                          }}
                        >
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* 输入框区域 */}
            <div
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                border: `1px solid ${currentConfig.color}40`,
                borderRadius: "8px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "280px",
                boxShadow: `0 4px 12px ${currentConfig.color}20`,
                backdropFilter: "blur(12px)",
              }}
            >
              {/* 隐藏/切换按钮 */}
              <button
                onClick={() => {
                  if (availableContexts.length > 1) {
                    // 如果有多个上下文，切换到下一个
                    const currentIndex =
                      availableContexts.indexOf(activeContext);
                    const nextIndex =
                      (currentIndex + 1) % availableContexts.length;
                    setActiveContext(availableContexts[nextIndex]);
                  } else {
                    // 如果只有一个上下文，隐藏聊天
                    setIsOpen(false);
                  }
                }}
                style={{
                  background: `linear-gradient(135deg, ${currentConfig.color} 0%, ${currentConfig.color}CC 100%)`,
                  border: "none",
                  padding: "6px",
                  cursor: "pointer",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  transition: "all 0.3s ease",
                  boxShadow: `0 2px 6px ${currentConfig.color}50`,
                }}
                title={
                  availableContexts.length > 1
                    ? `切换到${getContextConfig(availableContexts[(availableContexts.indexOf(activeContext) + 1) % availableContexts.length]).label}聊天`
                    : "隐藏聊天"
                }
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.boxShadow = `0 4px 12px ${currentConfig.color}60`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = `0 2px 6px ${currentConfig.color}50`;
                }}
              >
                {availableContexts.length > 1 ? (
                  <currentConfig.icon size={14} />
                ) : (
                  <svg
                    style={{ width: "12px", height: "12px" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                )}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={`输入${currentConfig.label}消息并按 Enter 发送...`}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  backgroundColor: "transparent",
                  fontSize: "13px",
                  color: "#1F2937",
                  fontWeight: "400",
                }}
              />

              {/* 发送提示图标 */}
              {inputMessage.trim() && (
                <div
                  style={{
                    color: currentConfig.color,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <svg
                    style={{ width: "12px", height: "12px" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  <span style={{ fontSize: "10px", fontWeight: "500" }}>
                    Enter
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 当聊天隐藏时显示的现代化图标 */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            style={{
              background: `linear-gradient(135deg, ${currentConfig.color} 0%, ${currentConfig.color}CC 100%)`,
              border: "none",
              borderRadius: "12px",
              padding: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              transition: "all 0.3s ease",
              boxShadow: `0 6px 20px ${currentConfig.color}60`,
              position: "relative",
              backdropFilter: "blur(8px)",
            }}
            title={`显示${currentConfig.label}聊天`}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05) translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 8px 25px ${currentConfig.color}70`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1) translateY(0)";
              e.currentTarget.style.boxShadow = `0 6px 20px ${currentConfig.color}60`;
            }}
          >
            <svg
              style={{ width: "18px", height: "18px" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 3.582-8 8-8s8 3.582 8 8z"
              />
            </svg>

            {/* 未读消息提示 */}
            {Object.values(messages).some(
              (msgArray) => msgArray.length > 0
            ) && (
              <div
                style={{
                  position: "absolute",
                  top: "-6px",
                  right: "-6px",
                  background:
                    "linear-gradient(135deg, #FF6B6B 0%, #FF8E8E 100%)",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: "700",
                  borderRadius: "50%",
                  width: "20px",
                  height: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "20px",
                  boxShadow: "0 2px 8px rgba(255, 107, 107, 0.4)",
                  animation: "pulse 2s infinite",
                }}
              >
                {Object.values(messages).reduce(
                  (total, msgArray) => total + msgArray.length,
                  0
                ) > 99
                  ? "99+"
                  : Object.values(messages).reduce(
                      (total, msgArray) => total + msgArray.length,
                      0
                    )}
              </div>
            )}
          </button>
        )}

        {/* CSS 动画样式 */}
        <style>
          {`
          @keyframes slideInUp {
            from {
              opacity: 0;
              transform: translateY(6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes pulse {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.1);
            }
          }
        `}
        </style>
      </div>
    );
  }
);

MultiChat.displayName = "MultiChat";

export default MultiChat;

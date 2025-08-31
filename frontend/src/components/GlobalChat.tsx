import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { wsManager } from "../hooks/wsManager";
import type { ChatMessage, GameState } from "../hooks/wsManager";

const GlobalChat: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 订阅wsManager状态变化来获取全局消息
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribeState = wsManager.subscribe((gameState: GameState) => {
      // 只显示全局房间的消息
      const globalMessages = gameState.messages.filter(
        (msg: ChatMessage) => msg.room_id === "global" || msg.type === "system"
      );
      setMessages(globalMessages);
    });

    return unsubscribeState;
  }, [isAuthenticated]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 发送消息
  const handleSendMessage = () => {
    if (!inputMessage.trim() || !user) return;

    wsManager.send({
      type: "chat",
      room_id: "global",
      sender_id: user.user_id,
      username: user.username,
      content: inputMessage.trim(),
    });

    setInputMessage("");
  };

  // 处理回车键发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 格式化时间 - 修复invalid date问题
  const formatTime = (timestamp?: string) => {
    if (!timestamp) {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // 尝试解析时间戳
    let date: Date;
    if (timestamp.includes(":") && !timestamp.includes("T")) {
      // 如果是时分秒格式，直接返回
      return timestamp;
    } else {
      // 尝试作为日期字符串解析
      date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        // 如果解析失败，返回当前时间
        date = new Date();
      }
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
          {/* 消息显示区域 - 无外框，直接显示消息 */}
          {messages.length > 0 && (
            <div
              style={{
                marginBottom: "4px",
                width: "280px",
                maxHeight: messages.length > 8 ? "240px" : "auto",
                overflowY: messages.length > 8 ? "auto" : "visible",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {messages.slice(-15).map((message, index) => (
                <div
                  key={index}
                  style={{
                    animation:
                      index === messages.slice(-15).length - 1
                        ? "slideInUp 0.2s ease-out"
                        : "none",
                  }}
                >
                  {message.type === "system" || message.username === "系统" ? (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#8B5CF6",
                        fontStyle: "italic",
                        textAlign: "center",
                        padding: "4px 8px",
                        backgroundColor: "rgba(139, 92, 246, 0.1)",
                        borderLeft: "3px solid #8B5CF6",
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
                        borderLeft: "3px solid #E5E7EB",
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

          {/* 输入框区域 - 现代化设计 */}
          <div
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid rgba(229, 231, 235, 0.8)",
              borderRadius: "8px",
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "280px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
              backdropFilter: "blur(12px)",
            }}
          >
            {/* 隐藏按钮 - 现代化设计 */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              style={{
                background: "linear-gradient(135deg, #667EEA 0%, #764BA2 100%)",
                border: "none",
                padding: "6px",
                cursor: "pointer",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                transition: "all 0.3s ease",
                boxShadow: "0 2px 6px rgba(102, 126, 234, 0.3)",
              }}
              title="隐藏全局聊天 (点击收起)"
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(102, 126, 234, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow =
                  "0 2px 6px rgba(102, 126, 234, 0.3)";
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
                  strokeWidth={2.5}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入全局消息并按 Enter 发送..."
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
                  color: "#10B981",
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
            background: "linear-gradient(135deg, #667EEA 0%, #764BA2 100%)",
            border: "none",
            borderRadius: "12px",
            padding: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            transition: "all 0.3s ease",
            boxShadow: "0 6px 20px rgba(102, 126, 234, 0.4)",
            position: "relative",
            backdropFilter: "blur(8px)",
          }}
          title="显示全局聊天 (点击展开)"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05) translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 8px 25px rgba(102, 126, 234, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1) translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 6px 20px rgba(102, 126, 234, 0.4)";
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

          {/* 现代化未读消息提示 */}
          {messages.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "-6px",
                right: "-6px",
                background: "linear-gradient(135deg, #FF6B6B 0%, #FF8E8E 100%)",
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
              {messages.length > 99 ? "99+" : messages.length}
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
};

export default GlobalChat;

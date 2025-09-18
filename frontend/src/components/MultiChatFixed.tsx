import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  IconButton,
  Badge,
} from "@chakra-ui/react";
import {
  LuMessageCircle,
  LuGlobe,
  LuUsers,
  LuGamepad2,
  LuSend,
  LuChevronDown,
} from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { wsManager } from "../hooks/wsManager";
import type { ChatMessage, GameState } from "../hooks/wsManager";

interface MultiChatProps {
  currentContext: "global" | "room" | "game";
  roomId?: string;
}

const MultiChat: React.FC<MultiChatProps> = ({ currentContext, roomId }) => {
  const { isAuthenticated, user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"global" | "room" | "game">(
    currentContext
  );
  const [messages, setMessages] = useState<{
    global: ChatMessage[];
    room: ChatMessage[];
    game: ChatMessage[];
  }>({
    global: [],
    room: [],
    game: [],
  });
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 当context改变时自动切换tab
  useEffect(() => {
    setActiveTab(currentContext);
  }, [currentContext]);

  // 订阅wsManager状态变化来获取消息
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribeState = wsManager.subscribe((gameState: GameState) => {
      setMessages({
        global: gameState.messages.filter(
          (msg: ChatMessage) =>
            msg.room_id === "global" || msg.type === "system"
        ),
        room: roomId
          ? gameState.messages.filter(
              (msg: ChatMessage) =>
                msg.room_id === roomId &&
                (msg.type === "chat" || msg.type === "chat_message") &&
                !msg.content?.startsWith("[游戏]") // 排除游戏消息
            )
          : [],
        game: roomId
          ? gameState.messages.filter(
              (msg: ChatMessage) =>
                msg.room_id === roomId && msg.content?.startsWith("[游戏]") // 游戏消息以特殊前缀标识
            )
          : [],
      });
    });

    return unsubscribeState;
  }, [isAuthenticated, roomId]);

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages[activeTab]]);

  // 发送消息
  const handleSendMessage = () => {
    if (!inputMessage.trim() || !user) return;

    const targetRoomId = activeTab === "global" ? "global" : roomId || "global";
    let messageContent = inputMessage.trim();

    // 为游戏消息添加特殊前缀
    if (activeTab === "game") {
      messageContent = `[游戏] ${messageContent}`;
    }

    wsManager.send({
      type: "chat",
      room_id: targetRoomId,
      sender_id: user.user_id,
      username: user.username,
      content: messageContent,
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

  // 获取tab配置
  const getTabConfig = (tab: "global" | "room" | "game") => {
    switch (tab) {
      case "global":
        return {
          icon: LuGlobe,
          label: "全局",
          color: "blue",
          disabled: false,
        };
      case "room":
        return {
          icon: LuUsers,
          label: "房间",
          color: "green",
          disabled: !roomId,
        };
      case "game":
        return {
          icon: LuGamepad2,
          label: "游戏",
          color: "purple",
          disabled: !roomId,
        };
    }
  };

  // 获取未读消息数量
  const getUnreadCount = (tab: "global" | "room" | "game") => {
    return messages[tab].length;
  };

  if (!isAuthenticated) {
    return null;
  }

  const currentMessages = messages[activeTab] || [];

  return (
    <Box
      position="fixed"
      bottom="20px"
      right="20px"
      zIndex={1000}
      w={isOpen ? "320px" : "auto"}
    >
      {isOpen ? (
        <Box
          bg="rgba(255, 255, 255, 0.95)"
          backdropFilter="blur(12px)"
          borderRadius="md"
          border="1px solid"
          borderColor="gray.200"
          overflow="hidden"
        >
          <VStack gap={0} align="stretch">
            {/* Tab切换区域 */}
            <HStack
              p={2}
              borderBottom="1px solid"
              borderColor="gray.200"
              justify="space-between"
              align="center"
            >
              <HStack gap={1} flex={1}>
                {(["global", "room", "game"] as const).map((tab) => {
                  const config = getTabConfig(tab);
                  const IconComponent = config.icon;
                  const isActive = activeTab === tab;
                  const unreadCount = getUnreadCount(tab);

                  return (
                    <Button
                      key={tab}
                      size="xs"
                      variant={isActive ? "solid" : "ghost"}
                      colorPalette={config.color}
                      onClick={() => setActiveTab(tab)}
                      disabled={config.disabled}
                      fontSize="xs"
                      px={2}
                      position="relative"
                    >
                      <HStack gap={1}>
                        <IconComponent size={12} />
                        <Text>{config.label}</Text>
                      </HStack>
                      {!isActive && unreadCount > 0 && (
                        <Badge
                          position="absolute"
                          top="-1"
                          right="-1"
                          size="xs"
                          colorPalette="red"
                          borderRadius="full"
                          fontSize="9px"
                          minW="16px"
                          h="16px"
                        >
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  );
                })}
              </HStack>

              <IconButton
                size="xs"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                aria-label="收起聊天"
              >
                <LuChevronDown />
              </IconButton>
            </HStack>

            {/* 消息显示区域 */}
            <Box
              h="240px"
              overflowY="auto"
              p={2}
              css={{
                "&::-webkit-scrollbar": {
                  width: "4px",
                },
                "&::-webkit-scrollbar-track": {
                  background: "rgba(0,0,0,0.1)",
                  borderRadius: "2px",
                },
                "&::-webkit-scrollbar-thumb": {
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: "2px",
                },
              }}
            >
              <VStack gap={1} align="stretch">
                {currentMessages.slice(-20).map((message, index) => (
                  <Box
                    key={index}
                    animation={
                      index === currentMessages.slice(-20).length - 1
                        ? "slideInUp 0.2s ease-out"
                        : "none"
                    }
                  >
                    {message.type === "system" ||
                    message.username === "系统" ? (
                      <Box
                        bg="purple.50"
                        borderLeft="3px solid"
                        borderColor="purple.400"
                        p={2}
                        borderRadius="md"
                        fontSize="xs"
                        color="purple.700"
                        textAlign="center"
                        fontStyle="italic"
                      >
                        {message.content}
                      </Box>
                    ) : (
                      <Box
                        bg="gray.50"
                        borderLeft="3px solid"
                        borderColor="gray.300"
                        p={2}
                        borderRadius="md"
                        fontSize="xs"
                      >
                        <HStack justify="space-between" align="start">
                          <Box flex={1} minW={0}>
                            <Text
                              fontWeight="bold"
                              color="gray.700"
                              fontSize="xs"
                              display="inline"
                              mr={2}
                            >
                              {message.username || "匿名用户"}:
                            </Text>
                            <Text
                              color="gray.600"
                              fontSize="xs"
                              display="inline"
                              wordBreak="break-word"
                            >
                              {message.content}
                            </Text>
                          </Box>
                          <Text
                            fontSize="9px"
                            color="gray.400"
                            flexShrink={0}
                            ml={2}
                          >
                            {formatTime(message.timestamp)}
                          </Text>
                        </HStack>
                      </Box>
                    )}
                  </Box>
                ))}
                <div ref={messagesEndRef} />
              </VStack>
            </Box>

            {/* 输入区域 */}
            <HStack p={2} borderTop="1px solid" borderColor="gray.200" gap={2}>
              <Input
                size="sm"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={`输入${getTabConfig(activeTab).label}消息...`}
                flex={1}
                fontSize="xs"
              />
              <IconButton
                size="sm"
                colorPalette={getTabConfig(activeTab).color}
                onClick={handleSendMessage}
                disabled={!inputMessage.trim()}
                aria-label="发送消息"
              >
                <LuSend size={12} />
              </IconButton>
            </HStack>
          </VStack>
        </Box>
      ) : (
        <IconButton
          size="lg"
          colorPalette="blue"
          onClick={() => setIsOpen(true)}
          position="relative"
          borderRadius="full"
          aria-label="展开聊天"
        >
          <LuMessageCircle size={20} />
          {Object.values(messages).some((msgArray) => msgArray.length > 0) && (
            <Badge
              position="absolute"
              top="-1"
              right="-1"
              colorPalette="red"
              borderRadius="full"
              fontSize="9px"
              minW="18px"
              h="18px"
            >
              {Object.values(messages).reduce(
                (total, msgArray) => total + msgArray.length,
                0
              )}
            </Badge>
          )}
        </IconButton>
      )}

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
        `}
      </style>
    </Box>
  );
};

export default MultiChat;

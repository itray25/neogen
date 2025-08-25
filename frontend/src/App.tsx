import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { Route, useNavigate, Routes } from "react-router-dom";
import {
  Button,
  HStack,
  VStack,
  Input,
  Box,
  Text,
  Badge,
  Separator,
  createToaster,
  Toaster,
} from "@chakra-ui/react";

// 创建 toaster 实例
const toaster = createToaster({
  placement: "top-end",
});

interface ChatMessage {
  type:
    | "chat"
    | "join_room"
    | "leave_room"
    | "change_name"
    | "ok"
    | "error"
    | "system"
    | "room_info";
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
}

const WebSocketTester = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomPlayers, setRoomPlayers] = useState<
    { id: number; name: string }[]
  >([]);
  const [messageInput, setMessageInput] = useState("");
  const [roomId, setRoomId] = useState("1");
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connectWebSocket = () => {
    try {
      const websocket = new WebSocket("ws://localhost:3000/ws");

      websocket.onopen = () => {
        setIsConnected(true);
        setWs(websocket);
        setCurrentRoomId(1); // 默认加入房间1
        addSystemMessage("🎉 WebSocket 连接成功！自动加入房间1");
        toaster.create({
          title: "连接成功",
          description: "WebSocket 连接已建立，已自动加入房间1",
          type: "success",
          duration: 3000,
        });
      };

      websocket.onmessage = (event) => {
        try {
          const message: ChatMessage = JSON.parse(event.data);
          message.timestamp = new Date().toLocaleTimeString();
          setMessages((prev) => [...prev, message]);

          // 处理不同类型的消息
          switch (message.type) {
            case "room_info":
              if (Array.isArray(message.players)) {
                setRoomPlayers(
                  message.players.map(([id, name]) => ({ id, name }))
                );
              }
              break;
            case "ok":
              // 成功确认消息
              toaster.create({
                title: "操作成功",
                description: "操作已成功执行",
                type: "success",
                duration: 2000,
              });
              break;
            case "error":
              // 错误消息
              toaster.create({
                title: "操作失败",
                description: message.message || "发生未知错误",
                type: "error",
                duration: 4000,
              });
              break;
            case "join_room":
              // 加入房间成功，更新当前房间
              if (message.player_id === currentPlayerId) {
                setCurrentRoomId(message.room_id || null);
                toaster.create({
                  title: "加入房间成功",
                  description: `已加入房间 ${message.room_id}`,
                  type: "success",
                  duration: 3000,
                });
                // 加入房间后主动获取房间玩家信息
                if (ws) {
                  ws.send(
                    JSON.stringify({
                      type: "get_room_info",
                      room_id: message.room_id,
                    })
                  );
                }
              } else {
                toaster.create({
                  title: "新玩家加入",
                  description: `${message.player_name} 加入了房间`,
                  type: "info",
                  duration: 2000,
                });
                // 有玩家加入也刷新房间玩家信息
                if (ws) {
                  ws.send(
                    JSON.stringify({
                      type: "get_room_info",
                      room_id: message.room_id,
                    })
                  );
                }
              }
              break;
            case "leave_room":
              // 离开房间
              if (message.player_id === currentPlayerId) {
                setCurrentRoomId(null);
                toaster.create({
                  title: "离开房间",
                  description: `已离开房间 ${message.room_id}`,
                  type: "warning",
                  duration: 3000,
                });
              }
              // 有玩家离开也刷新房间玩家信息
              if (ws && message.room_id) {
                ws.send(
                  JSON.stringify({
                    type: "get_room_info",
                    room_id: message.room_id,
                  })
                );
              }
              break;
            case "change_name":
              // 名称更改确认
              if (message.player_id === currentPlayerId) {
                toaster.create({
                  title: "名称已更改",
                  description: `名称已更改为: ${message.new_name}`,
                  type: "success",
                  duration: 3000,
                });
              }
              // 有玩家更名也刷新房间玩家信息
              if (ws && currentRoomId) {
                ws.send(
                  JSON.stringify({
                    type: "get_room_info",
                    room_id: currentRoomId,
                  })
                );
              }
              break;
          }

          // 如果是欢迎消息，提取 player_id
          if (
            message.type === "join_room" &&
            message.player_id &&
            !currentPlayerId
          ) {
            setCurrentPlayerId(message.player_id);
            setCurrentRoomId(message.room_id || 1);
            // 获取房间玩家信息
            if (ws) {
              ws.send(JSON.stringify({ type: "get_room_info" }));
            }
          }
        } catch (error) {
          addSystemMessage(`❌ 消息解析错误: ${event.data}`);
        }
      };

      websocket.onclose = () => {
        setIsConnected(false);
        setWs(null);
        addSystemMessage("🔌 WebSocket 连接已关闭");
        toaster.create({
          title: "连接断开",
          description: "WebSocket 连接已断开",
          type: "warning",
          duration: 3000,
        });
      };

      websocket.onerror = (error) => {
        addSystemMessage(`❌ WebSocket 错误: ${error}`);
        toaster.create({
          title: "连接错误",
          description: "WebSocket 连接失败",
          type: "error",
          duration: 3000,
        });
      };
    } catch (error) {
      addSystemMessage(`❌ 连接失败: ${error}`);
    }
  };

  const disconnectWebSocket = () => {
    if (ws) {
      ws.close();
    }
  };

  const addSystemMessage = (content: string) => {
    const systemMessage: ChatMessage = {
      type: "system",
      content,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, systemMessage]);
  };

  const sendChatMessage = () => {
    if (ws && isConnected && messageInput.trim()) {
      const message = {
        type: "chat",
        content: messageInput.trim(),
      };

      ws.send(JSON.stringify(message));
      addSystemMessage(`📤 发送: ${messageInput}`);
      setMessageInput("");
    }
  };

  const joinRoom = () => {
    if (ws && isConnected && roomId) {
      // 如果已经在其他房间，先离开当前房间
      if (currentRoomId && currentRoomId !== parseInt(roomId)) {
        const leaveMessage = {
          type: "leave_room",
          room_id: currentRoomId,
          player_id: currentPlayerId,
        };
        ws.send(JSON.stringify(leaveMessage));
        addSystemMessage(`🚪 离开房间 ${currentRoomId}`);
        // 等待后端处理后再加入新房间，防止room_id错误
        setTimeout(() => {
          const message = {
            type: "join_room",
            room_id: parseInt(roomId),
          };
          ws.send(JSON.stringify(message));
          addSystemMessage(`🚪 尝试加入房间 ${roomId}`);
        }, 100);
      } else {
        const message = {
          type: "join_room",
          room_id: parseInt(roomId),
        };
        ws.send(JSON.stringify(message));
        addSystemMessage(`🚪 尝试加入房间 ${roomId}`);
      }
    }
  };

  const leaveRoom = () => {
    if (ws && isConnected && currentRoomId && currentPlayerId) {
      const message = {
        type: "leave_room",
        room_id: currentRoomId,
        player_id: currentPlayerId,
      };

      ws.send(JSON.stringify(message));
      addSystemMessage(`🚪 离开房间 ${currentRoomId}`);
    }
  };

  const changeName = () => {
    if (ws && isConnected && newName.trim() && currentPlayerId) {
      const message = {
        type: "change_name",
        new_name: newName.trim(),
      };

      ws.send(JSON.stringify(message));
      addSystemMessage(`👤 尝试更改名称为: ${newName}`);
      setNewName("");
    }
  };

  const sendMoveMessage = (direction: string) => {
    if (ws && isConnected) {
      const message = {
        type: "move",
        direction: direction,
        from: { x: 10, y: 20 },
      };

      ws.send(JSON.stringify(message));
      addSystemMessage(`🚶 发送移动: ${direction}`);
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const getMessageColor = (message: ChatMessage) => {
    switch (message.type) {
      case "chat":
        return "blue.500";
      case "join_room":
        return "green.500";
      case "leave_room":
        return "orange.500";
      case "change_name":
        return "purple.500";
      case "ok":
        return "green.600";
      case "error":
        return "red.500";
      case "system":
        return "gray.500";
      default:
        return "black";
    }
  };

  return (
    <VStack p={6} align="stretch" maxW="800px" mx="auto">
      {/* 连接状态和控制 */}
      <Box borderWidth={1} borderRadius="lg" p={4}>
        <HStack justify="space-between" mb={4}>
          <Text fontSize="xl" fontWeight="bold">
            WebSocket 测试工具
          </Text>
          <Badge
            colorScheme={isConnected ? "green" : "red"}
            fontSize="md"
            p={2}
          >
            {isConnected ? "已连接" : "未连接"}
          </Badge>
        </HStack>

        <HStack>
          <Button
            colorScheme="green"
            onClick={connectWebSocket}
            disabled={isConnected}
          >
            连接 WebSocket
          </Button>
          <Button
            colorScheme="red"
            onClick={disconnectWebSocket}
            disabled={!isConnected}
          >
            断开连接
          </Button>
          <Button onClick={clearMessages} variant="outline">
            清空消息
          </Button>
        </HStack>

        {currentPlayerId && (
          <Text mt={2} color="blue.600">
            当前玩家 ID: {currentPlayerId} | 当前房间: {currentRoomId || "无"}
          </Text>
        )}
      </Box>

      {/* 房间控制和玩家列表 */}
      <Box borderWidth={1} borderRadius="lg" p={4}>
        <Text fontWeight="bold" mb={2}>
          房间操作
        </Text>
        <HStack mb={2}>
          <Input
            placeholder="房间 ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            width="150px"
          />
          <Button colorScheme="blue" onClick={joinRoom} disabled={!isConnected}>
            加入房间
          </Button>
          <Button
            colorScheme="orange"
            onClick={leaveRoom}
            disabled={!isConnected || !currentRoomId}
          >
            离开房间
          </Button>
        </HStack>
        <Box mt={2}>
          <Text fontWeight="bold" mb={1}>
            房间玩家列表：
          </Text>
          {roomPlayers.length === 0 ? (
            <Text color="gray.500">暂无玩家</Text>
          ) : (
            <VStack align="start" gap={1}>
              {roomPlayers.map((p) => (
                <Text
                  key={p.id}
                  color={p.id === currentPlayerId ? "blue.600" : "gray.700"}
                >
                  {p.name} (ID: {p.id})
                </Text>
              ))}
            </VStack>
          )}
        </Box>
      </Box>

      {/* 用户名更改 */}
      <Box borderWidth={1} borderRadius="lg" p={4}>
        <Text fontWeight="bold" mb={2}>
          更改用户名
        </Text>
        <HStack>
          <Input
            placeholder="新用户名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && changeName()}
          />
          <Button
            colorScheme="purple"
            onClick={changeName}
            disabled={!isConnected || !newName.trim()}
          >
            更改名称
          </Button>
        </HStack>
      </Box>

      {/* 移动控制 */}
      <Box borderWidth={1} borderRadius="lg" p={4}>
        <Text fontWeight="bold" mb={2}>
          移动操作
        </Text>
        <HStack>
          <Button onClick={() => sendMoveMessage("up")} disabled={!isConnected}>
            ⬆️ 上
          </Button>
          <Button
            onClick={() => sendMoveMessage("down")}
            disabled={!isConnected}
          >
            ⬇️ 下
          </Button>
          <Button
            onClick={() => sendMoveMessage("left")}
            disabled={!isConnected}
          >
            ⬅️ 左
          </Button>
          <Button
            onClick={() => sendMoveMessage("right")}
            disabled={!isConnected}
          >
            ➡️ 右
          </Button>
        </HStack>
      </Box>

      {/* 聊天功能 */}
      <Box borderWidth={1} borderRadius="lg" p={4}>
        <Text fontWeight="bold" mb={2}>
          聊天功能
        </Text>
        <HStack>
          <Input
            placeholder="输入聊天消息..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
          />
          <Button
            colorScheme="blue"
            onClick={sendChatMessage}
            disabled={!isConnected || !messageInput.trim()}
          >
            发送
          </Button>
        </HStack>
      </Box>

      {/* 消息显示区域 */}
      <Box
        borderWidth={1}
        borderRadius="lg"
        p={4}
        height="400px"
        overflowY="auto"
      >
        <Text fontWeight="bold" mb={2}>
          消息记录
        </Text>

        {messages.length === 0 ? (
          <Text color="gray.500" textAlign="center" mt={8}>
            暂无消息...
          </Text>
        ) : (
          <VStack align="stretch">
            {messages.map((message, index) => (
              <Box
                key={index}
                p={2}
                borderRadius="md"
                bg={message.type === "system" ? "gray.50" : "blue.50"}
                borderLeft="4px solid"
                borderLeftColor={getMessageColor(message)}
              >
                <HStack justify="space-between">
                  <VStack align="start">
                    <HStack>
                      <Badge
                        colorScheme={
                          message.type === "system" ? "gray" : "blue"
                        }
                      >
                        {message.type}
                      </Badge>
                      {message.sender_id && (
                        <Text fontSize="sm" color="gray.600">
                          玩家 {message.sender_id}
                        </Text>
                      )}
                      {message.player_id && (
                        <Text fontSize="sm" color="gray.600">
                          玩家 {message.player_id}
                        </Text>
                      )}
                      {message.room_id && (
                        <Text fontSize="sm" color="gray.600">
                          房间 {message.room_id}
                        </Text>
                      )}
                    </HStack>
                    <Text>
                      {message.content ||
                        (message.type === "ok"
                          ? "✅ 操作成功"
                          : message.type === "error"
                          ? `❌ ${message.message}`
                          : message.type === "join_room"
                          ? `${
                              message.player_name || `玩家${message.player_id}`
                            } 加入了房间`
                          : message.type === "leave_room"
                          ? `玩家${message.player_id} 离开了房间`
                          : message.type === "change_name"
                          ? `玩家${message.player_id} 改名为 ${message.new_name}`
                          : "未知消息类型")}
                    </Text>
                  </VStack>
                  <Text fontSize="xs" color="gray.500">
                    {message.timestamp}
                  </Text>
                </HStack>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </VStack>
        )}
      </Box>
    </VStack>
  );
};

const App = () => {
  const navigate = useNavigate();
  /* CRA: app hooks */

  // @ts-ignore
  return (
    <div className="App">
      <WebSocketTester />
      <Toaster
        toaster={toaster}
        children={(toast) => (
          <Box p={3} bg="white" borderRadius="md" boxShadow="md">
            <Text fontWeight="bold">{toast.title}</Text>
            <Text>{toast.description}</Text>
          </Box>
        )}
      />
    </div>
  );
};

export default App;

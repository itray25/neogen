import React, { useState } from "react";
import "../App.css";
import {
  Button,
  HStack,
  VStack,
  Input,
  Box,
  Text,
  Badge,
  Toaster,
} from "@chakra-ui/react";
import { useWebSocket } from "../hooks/websocket";

const Room = () => {
  const {
    gameState,
    connect,
    disconnect,
    sendChat,
    joinRoom,
    leaveRoom,
    changeName,
    toggleForceStart,
    sendMove,
    clearMessages,
  } = useWebSocket();

  const [messageInput, setMessageInput] = useState("");
  const [roomId, setRoomId] = useState("1");
  const [newName, setNewName] = useState("");

  const {
    isConnected,
    currentPlayerId,
    currentRoomId,
    roomPlayers,
    forceStartCount,
    requiredToStart,
    isForcingStart,
    messages,
  } = gameState;

  const handleSendChat = () => {
    if (messageInput.trim()) {
      sendChat(messageInput.trim());
      setMessageInput("");
    }
  };

  const handleJoinRoom = () => {
    if (roomId) {
      joinRoom(parseInt(roomId));
    }
  };

  const handleChangeName = () => {
    if (newName.trim()) {
      changeName(newName.trim());
      setNewName("");
    }
  };

  const getMessageColor = (type: string) => {
    switch (type) {
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
            游戏房间
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
          <Button colorScheme="green" onClick={connect} disabled={isConnected}>
            连接
          </Button>
          <Button
            colorScheme="red"
            onClick={disconnect}
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
          <Button
            colorScheme="blue"
            onClick={handleJoinRoom}
            disabled={!isConnected}
          >
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

        <Box mt={4}>
          <Button
            colorScheme={isForcingStart ? "red" : "green"}
            onClick={toggleForceStart}
            disabled={!isConnected || !currentRoomId}
          >
            Forcestart {forceStartCount}/{requiredToStart}
          </Button>
        </Box>

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
            onKeyPress={(e) => e.key === "Enter" && handleChangeName()}
          />
          <Button
            colorScheme="purple"
            onClick={handleChangeName}
            disabled={!isConnected || !newName.trim()}
          >
            更改名称
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
            onKeyPress={(e) => e.key === "Enter" && handleSendChat()}
          />
          <Button
            colorScheme="blue"
            onClick={handleSendChat}
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
                borderLeftColor={getMessageColor(message.type)}
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
                    </HStack>
                    <Text>{message.content || "系统消息"}</Text>
                  </VStack>
                  <Text fontSize="xs" color="gray.500">
                    {message.timestamp}
                  </Text>
                </HStack>
              </Box>
            ))}
          </VStack>
        )}
      </Box>
    </VStack>
  );
};

export default Room;

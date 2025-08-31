import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  IconButton,
  Flex,
  Card,
  Heading,
  Input,
  Textarea,
} from "@chakra-ui/react";
import { LuArrowLeft, LuSend, LuLock } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../hooks/websocket";
import { wsManager } from "../hooks/wsManager";
import { toaster } from "@/components/ui/toaster";
import { PasswordPrompt } from "../components/PasswordPrompt";
import { GroupSelector } from "../components/GroupSelector";
import type { ChatMessage, GroupInfo } from "../hooks/wsManager";

interface PlayerInfo {
  user_id: string;
  username: string;
  status: string;
}

interface RoomInfo {
  name: string;
  host_player_name: string;
  admin_player_name?: string; // 新增：管理员用户名
  status: string;
  players: string[]; // 后端返回的是用户名列表
  player_count: number;
  force_start_players: string[];
  required_to_start: number;
  groups?: { [key: number]: GroupInfo }; // 新增：房间分组信息
}

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  // 使用普通的WebSocket hook，不重复建立连接
  const { gameState } = useWebSocket();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [connected, setConnected] = useState(gameState.isConnected);
  const [inputMessage, setInputMessage] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [hasTriedJoin, setHasTriedJoin] = useState(false);

  // 从wsManager获取房间消息
  const messages = roomId ? wsManager.getRoomMessages(roomId) : [];

  // 请求房间信息
  useEffect(() => {
    if (!roomId || !user || !isAuthenticated || !gameState.isConnected) return;

    // 监听WebSocket连接状态变化
    setConnected(gameState.isConnected);

    // 当连接建立后，加入房间并请求房间信息
    if (gameState.isConnected && !hasTriedJoin) {
      setHasTriedJoin(true);
      const password = location.state?.password;
      wsManager.joinRoom(roomId, user.username, password);
      // 请求房间详细信息
      setTimeout(() => {
        wsManager.send({
          type: "get_room_info",
          room_id: roomId,
        });
      }, 500); // 延迟一点时间确保加入房间完成
    }
  }, [roomId, user, isAuthenticated, gameState.isConnected, hasTriedJoin]);

  useEffect(() => {
    // 订阅WebSocket消息 - 处理房间相关消息
    const unsubscribeMessages = wsManager.subscribeToMessages(
      (message: ChatMessage) => {
        console.log("收到消息:", message);

        switch (message.type) {
          case "room_info":
            if (message.room_id == roomId) {
              // 直接从message对象获取房间信息，不再从content解析
              console.log("收到房间信息:", message);
              const roomData: RoomInfo = {
                name: message.name || `房间 ${roomId}`,
                host_player_name: message.host_player_name || "未知",
                admin_player_name: message.admin_player_name || undefined,
                status: message.status || "未知",
                players: Array.isArray(message.players)
                  ? message.players.map((p: any) =>
                      typeof p === "string" ? p : p[1]
                    )
                  : [],
                player_count: message.player_count || 0,
                force_start_players: Array.isArray(message.force_start_players)
                  ? message.force_start_players.map((p: any) =>
                      typeof p === "string" ? p : String(p)
                    )
                  : [],
                required_to_start: message.required_to_start || 0,
                groups: message.groups || {}, // 新增：分组信息
              };
              setRoomInfo(roomData);

              // 转换玩家信息格式
              if (roomData.players && Array.isArray(roomData.players)) {
                const playerList = roomData.players.map(
                  (username: string, index: number) => ({
                    user_id: username, // 使用用户名作为ID
                    username: username,
                    status: "active",
                  })
                );
                setPlayers(playerList);
              }
              break;
            }
          case "chat_message":
            // 聊天消息已经由wsManager处理，这里不需要额外处理
            break;

          case "join_room":
            // 有新玩家加入
            if (
              message.player_name &&
              user &&
              message.player_name !== user.username
            ) {
              setPlayers((prev) => {
                // 避免重复添加
                if (!prev.find((p) => p.username === message.player_name)) {
                  return [
                    ...prev,
                    {
                      user_id: message.player_name || "Unknown", // 使用玩家名作为临时ID
                      username: message.player_name || "Unknown",
                      status: "active",
                    },
                  ];
                }
                return prev;
              });
            }
            break;

          case "leave_room":
            if (message.player_name) {
              setPlayers((prev) =>
                prev.filter((p) => p.username !== message.player_name)
              );
            }
            break;

          case "error":
            // 处理需要密码的情况
            if (message.message === "需要密码") {
              setShowPasswordPrompt(true);
              return;
            }

            toaster.create({
              title: "错误",
              description: message.message || "发生未知错误",
              type: "error",
            });
            // 如果是密码错误或房间已满，则返回房间列表
            if (
              message.message === "密码错误" ||
              message.message === "房间已满" ||
              message.message === "房间不存在"
            ) {
              navigate("/room");
            }
            break;
        }
      }
    );

    // 组件卸载时的清理
    return () => {
      unsubscribeMessages();
      // 不要在这里调用leaveRoom，因为可能是路由跳转
      // leaveRoom的调用应该由用户显式触发
    };
  }, [user, roomId]);

  // 发送房间聊天消息
  const handleSendMessage = () => {
    if (!inputMessage.trim() || !user || !roomId) return;

    wsManager.sendChat(inputMessage.trim(), roomId);
    setInputMessage("");
  };

  // 处理回车键发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const leaveRoom = () => {
    if (user && roomId) {
      // 使用wsManager的leaveRoom方法，它会正确处理当前房间ID
      wsManager.leaveRoom();
    }
    navigate("/room");
  };

  // 处理密码提交
  const handlePasswordSubmit = (password: string) => {
    if (user && roomId) {
      setShowPasswordPrompt(false);
      wsManager.joinRoom(roomId, user.username, password);
      // 请求房间详细信息
      setTimeout(() => {
        wsManager.send({
          type: "get_room_info",
          room_id: roomId,
        });
      }, 500);
    }
  };

  // 处理密码提示关闭
  const handlePasswordClose = () => {
    setShowPasswordPrompt(false);
    navigate("/room");
  };

  // 设置管理员
  const setAdmin = (targetPlayerId: string) => {
    if (user && roomId) {
      wsManager.send({
        type: "set_admin",
        room_id: roomId,
        target_player_id: targetPlayerId,
      });
    }
  };

  // 撤销管理员
  const removeAdmin = () => {
    if (user && roomId) {
      wsManager.send({
        type: "remove_admin",
        room_id: roomId,
      });
    }
  };

  // 踢出玩家
  const kickPlayer = (targetPlayerId: string) => {
    if (user && roomId) {
      wsManager.send({
        type: "kick_player",
        room_id: roomId,
        target_player_id: targetPlayerId,
      });
    }
  };

  if (!roomId) {
    return (
      <Box p={8} textAlign="center">
        <Text>无效的房间ID</Text>
        <Button mt={4} onClick={() => navigate("/room")}>
          返回房间列表
        </Button>
      </Box>
    );
  }

  return (
    <Box p={6} maxW="1200px" mx="auto">
      {/* 房间头部 */}
      <Card.Root mb={6}>
        <Card.Body>
          <HStack justify="space-between" align="center">
            <HStack gap={4}>
              <IconButton
                aria-label="返回房间列表"
                size="sm"
                variant="outline"
                onClick={leaveRoom}
              >
                <LuArrowLeft />
              </IconButton>

              <Box>
                <Heading size="lg">
                  {roomInfo?.name || `房间 ${roomId}`}
                </Heading>
                <HStack gap={2} mt={1}>
                  <Badge
                    colorPalette={
                      roomInfo?.status === "active" ? "green" : "orange"
                    }
                  >
                    {roomInfo?.status || "未知"}
                  </Badge>
                  <Text fontSize="sm" color="gray.600">
                    {roomInfo?.player_count || players.length}/16 玩家
                  </Text>
                </HStack>
              </Box>
            </HStack>

            <Badge colorPalette={connected ? "green" : "red"}>
              {connected ? "已连接" : "未连接"}
            </Badge>
          </HStack>
        </Card.Body>
      </Card.Root>

      <HStack align="start" gap={6}>
        {/* 房间游戏区域 */}
        <Box flex="1">
          <VStack gap={4}>
            {/* 游戏区域 */}
            <Card.Root w="full">
              <Card.Header>
                <Heading size="md">游戏区域</Heading>
              </Card.Header>
              <Card.Body>
                <VStack
                  align="center"
                  justify="center"
                  h="300px"
                  bg="gray.50"
                  borderRadius="md"
                >
                  <Text fontSize="lg" color="gray.500">
                    等待游戏开始...
                  </Text>
                  <Text fontSize="sm" color="gray.400">
                    房间ID: {roomId}
                  </Text>
                </VStack>
              </Card.Body>
            </Card.Root>

            {/* 房间聊天 */}
            <Card.Root w="full">
              <Card.Header>
                <Heading size="md">房间聊天</Heading>
              </Card.Header>
              <Card.Body>
                <VStack align="stretch" gap={3}>
                  {/* 聊天消息显示区域 */}
                  <Box
                    h="200px"
                    overflowY="auto"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="md"
                    p={3}
                    bg="gray.50"
                  >
                    <VStack align="stretch" gap={2}>
                      {messages.length > 0 ? (
                        messages.map((msg, index) => (
                          <Box key={index}>
                            <Text fontSize="xs" color="gray.500">
                              {msg.timestamp} {msg.username || "系统"}:
                            </Text>
                            <Text fontSize="sm">
                              {msg.content || msg.message}
                            </Text>
                          </Box>
                        ))
                      ) : (
                        <Text fontSize="sm" color="gray.400" textAlign="center">
                          暂无聊天消息
                        </Text>
                      )}
                    </VStack>
                  </Box>

                  {/* 聊天输入框 */}
                  <HStack gap={2}>
                    <Input
                      placeholder="输入聊天消息..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={!connected}
                    />
                    <IconButton
                      aria-label="发送消息"
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || !connected}
                      colorPalette="blue"
                    >
                      <LuSend />
                    </IconButton>
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          </VStack>
        </Box>

        {/* 侧边栏 */}
        <VStack align="stretch" minW="300px" gap={4}>
          {/* 分组选择器 */}
          <Card.Root>
            <Card.Header>
              <Heading size="md">分组选择</Heading>
            </Card.Header>
            <Card.Body>
              <GroupSelector
                groups={wsManager.getRoomGroups(roomId || "")}
                currentGroupId={wsManager.getCurrentPlayerGroup(roomId || "")}
                onGroupChange={(groupId) => {
                  const currentGroupId = wsManager.getCurrentPlayerGroup(
                    roomId || ""
                  );
                  if (groupId === currentGroupId) return; // 已在该队伍，不发送请求
                  wsManager.changeGroup(roomId || "", groupId);
                }}
              />
            </Card.Body>
          </Card.Root>

          {/* 玩家列表 */}
          <Card.Root>
            <Card.Header>
              <Heading size="md">玩家列表</Heading>
            </Card.Header>
            <Card.Body>
              <VStack align="stretch" gap={2}>
                {players.map((player) => (
                  <Flex
                    key={player.user_id}
                    justify="space-between"
                    align="center"
                    p={2}
                    bg={
                      player.username === roomInfo?.host_player_name
                        ? "blue.50"
                        : player.username === roomInfo?.admin_player_name
                          ? "green.50"
                          : "transparent"
                    }
                    borderRadius="md"
                  >
                    <HStack>
                      <Text fontSize="sm">{player.username}</Text>
                      {player.username === roomInfo?.host_player_name && (
                        <Badge size="sm" colorPalette="blue">
                          房主
                        </Badge>
                      )}
                      {player.username === roomInfo?.admin_player_name && (
                        <Badge size="sm" colorPalette="green">
                          管理员
                        </Badge>
                      )}
                    </HStack>

                    <HStack>
                      {/* 设置管理员按钮，只有房主才能看到，且不能对自己设置 */}
                      {user?.username === roomInfo?.host_player_name &&
                        player.username !== roomInfo?.host_player_name &&
                        player.username !== roomInfo?.admin_player_name && (
                          <Button
                            size="xs"
                            variant="outline"
                            colorPalette="green"
                            onClick={() => setAdmin(player.user_id)}
                          >
                            设为管理员
                          </Button>
                        )}

                      {/* 撤销管理员按钮，只有房主才能看到，且只对管理员显示，但房主不能撤销自己的管理员权限 */}
                      {user?.username === roomInfo?.host_player_name &&
                        player.username === roomInfo?.admin_player_name &&
                        player.username !== roomInfo?.host_player_name && (
                          <Button
                            size="xs"
                            variant="outline"
                            colorPalette="orange"
                            onClick={removeAdmin}
                          >
                            撤销管理员
                          </Button>
                        )}

                      {/* 踢出玩家按钮，房主和管理员都能看到，但不能踢出房主 */}
                      {(user?.username === roomInfo?.host_player_name ||
                        user?.username === roomInfo?.admin_player_name) &&
                        player.username !== roomInfo?.host_player_name &&
                        player.username !== user?.username && (
                          <Button
                            size="xs"
                            variant="outline"
                            colorPalette="red"
                            onClick={() => kickPlayer(player.user_id)}
                          >
                            踢出
                          </Button>
                        )}
                    </HStack>
                  </Flex>
                ))}
                {players.length === 0 && (
                  <Text fontSize="sm" color="gray.500" textAlign="center">
                    暂无玩家
                  </Text>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        </VStack>
      </HStack>

      {/* 密码提示对话框 */}
      <PasswordPrompt
        isOpen={showPasswordPrompt}
        onClose={handlePasswordClose}
        onSubmit={handlePasswordSubmit}
        roomName={roomInfo?.name || `房间 ${roomId}`}
      />
    </Box>
  );
};

export default RoomPage;

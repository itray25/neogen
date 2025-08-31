import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Text,
  HStack,
  VStack,
  Badge,
  Button,
  ColorSwatch,
} from "@chakra-ui/react";
import { LuUsers, LuCrown, LuPlay, LuLock } from "react-icons/lu";
import { PasswordPrompt } from "./PasswordPrompt";

export interface RoomInfo {
  room_id: string; // 改为string类型以支持自定义房间ID
  name: string;
  host_name: string; // 改为host_name（房主的用户名）
  admin_name?: string; // 新增：管理员用户名
  status: string;
  player_count: number;
  max_players: number;
  room_color: string; // 添加房间颜色
  required_to_start: number;
  is_active: boolean;
  has_password: boolean; // 新增
}

interface RoomCardProps {
  room: RoomInfo;
}

export const RoomCard: React.FC<RoomCardProps> = ({ room }) => {
  const navigate = useNavigate();
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const isJoinable =
    room.player_count < room.max_players && room.status !== "playing";
  const canStart = room.player_count >= room.required_to_start;

  const handleJoin = (password?: string) => {
    navigate(`/rooms/${room.room_id}`, { state: { password } });
  };

  const handleJoinClick = () => {
    if (isJoinable) {
      if (room.has_password) {
        setShowPasswordPrompt(true);
      } else {
        handleJoin();
      }
    }
  };

  const handlePasswordSubmit = (password: string) => {
    setShowPasswordPrompt(false);
    handleJoin(password);
  };

  return (
    <>
      <Card.Root
        variant="elevated"
        size="sm"
        cursor={isJoinable ? "pointer" : "not-allowed"}
        opacity={isJoinable ? 1 : 0.7}
        _hover={
          isJoinable ? { transform: "translateY(-2px)", shadow: "lg" } : {}
        }
        transition="all 0.2s"
        borderTop="4px solid"
        borderTopColor={room.room_color}
      >
        <Card.Body p={4}>
          <VStack align="stretch" gap={3}>
            {/* 房间标题和状态 */}
            <HStack justify="space-between" align="center">
              <HStack>
                <ColorSwatch size="2xs" value={room.room_color} />
                <Text fontWeight="bold" fontSize="md" color="gray.800">
                  {room.name}
                </Text>
                {room.has_password && <LuLock size={14} color="gray" />}
              </HStack>
              <Badge
                size="sm"
                colorPalette={
                  room.status === "playing"
                    ? "red"
                    : room.is_active
                      ? "green"
                      : "gray"
                }
                variant="solid"
              >
                {room.status === "playing"
                  ? "游戏中"
                  : room.is_active
                    ? "等待中"
                    : "空闲"}
              </Badge>
            </HStack>

            {/* 房间信息 */}
            <VStack align="stretch" gap={2}>
              <HStack justify="space-between">
                <HStack gap={1} color="gray.600">
                  <LuCrown size={14} />
                  <Text fontSize="sm">房主</Text>
                </HStack>
                <Text fontSize="sm" fontWeight="medium">
                  {room.host_name || "无"}
                </Text>
              </HStack>

              {room.admin_name && (
                <HStack justify="space-between">
                  <HStack gap={1} color="gray.600">
                    <LuUsers size={14} />
                    <Text fontSize="sm">管理员</Text>
                  </HStack>
                  <Text fontSize="sm" fontWeight="medium">
                    {room.admin_name}
                  </Text>
                </HStack>
              )}

              <HStack justify="space-between">
                <HStack gap={1} color="gray.600">
                  <LuUsers size={14} />
                  <Text fontSize="sm">玩家数量</Text>
                </HStack>
                <Text fontSize="sm" fontWeight="medium">
                  {room.player_count}/{room.max_players}
                </Text>
              </HStack>

              <HStack justify="space-between">
                <HStack gap={1} color="gray.600">
                  <LuPlay size={14} />
                  <Text fontSize="sm">开始所需</Text>
                </HStack>
                <HStack gap={1}>
                  <Text fontSize="sm" fontWeight="medium">
                    {room.required_to_start}
                  </Text>
                  {canStart && (
                    <Badge size="xs" colorPalette="green" variant="solid">
                      可开始
                    </Badge>
                  )}
                </HStack>
              </HStack>
            </VStack>

            {/* 加入按钮 */}
            <Button
              size="sm"
              colorPalette="blue"
              variant={isJoinable ? "solid" : "ghost"}
              disabled={!isJoinable}
              onClick={handleJoinClick}
              w="100%"
            >
              {room.status === "playing"
                ? "游戏进行中"
                : !isJoinable
                  ? "房间已满"
                  : "加入房间"}
            </Button>
          </VStack>
        </Card.Body>
      </Card.Root>
      <PasswordPrompt
        isOpen={showPasswordPrompt}
        onClose={() => setShowPasswordPrompt(false)}
        onSubmit={handlePasswordSubmit}
        roomName={room.name}
      />
    </>
  );
};

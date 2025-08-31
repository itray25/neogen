import React, { useState, useEffect } from "react";
import {
  SimpleGrid,
  VStack,
  Text,
  Spinner,
  Button,
  HStack,
  Alert,
} from "@chakra-ui/react";
import { LuRefreshCw, LuInfo } from "react-icons/lu";
import { RoomCard, RoomInfo } from "./RoomCard";

interface RoomGridProps {}

interface GetRoomsResponse {
  rooms: RoomInfo[];
  total_count: number;
  start: number;
  end: number;
  has_more: boolean;
}

export const RoomGrid: React.FC<RoomGridProps> = () => {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const ROOMS_PER_PAGE = 8;

  const fetchRooms = async (startIndex: number = 0) => {
    try {
      setLoading(true);
      setError(null);

      const endIndex = startIndex + ROOMS_PER_PAGE;
      const response = await fetch(
        `http://localhost:3000/api/getRooms?start=${startIndex}&end=${endIndex}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GetRoomsResponse = await response.json();

      if (startIndex === 0) {
        setRooms(data.rooms);
      } else {
        setRooms((prev) => [...prev, ...data.rooms]);
      }

      setHasMore(data.has_more);
      setPage(Math.floor(endIndex / ROOMS_PER_PAGE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取房间列表失败");
      console.error("Failed to fetch rooms:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchRooms(page * ROOMS_PER_PAGE);
    }
  };

  const refresh = () => {
    setPage(0);
    fetchRooms(0);
  };

  useEffect(() => {
    fetchRooms(0);
  }, []);

  if (loading && rooms.length === 0) {
    return (
      <VStack gap={4} py={8}>
        <Spinner size="lg" colorPalette="blue" />
        <Text color="gray.600">加载房间列表...</Text>
      </VStack>
    );
  }

  if (error && rooms.length === 0) {
    return (
      <VStack gap={4} py={4}>
        <Alert.Root status="error" variant="subtle">
          <Alert.Indicator>
            <LuInfo />
          </Alert.Indicator>
          <Alert.Title>加载失败</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
        <Button onClick={refresh} colorPalette="blue" variant="outline">
          <LuRefreshCw size={16} />
          重试
        </Button>
      </VStack>
    );
  }

  return (
    <VStack gap={4} w="100%">
      {/* 顶部操作栏 */}
      <HStack justify="space-between" w="100%">
        <Text fontSize="sm" color="gray.600">
          找到 {rooms.length} 个房间
        </Text>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
          <LuRefreshCw size={14} />
          刷新
        </Button>
      </HStack>

      {/* 房间网格 */}
      {rooms.length === 0 ? (
        <VStack gap={2} py={8}>
          <Text color="gray.500" fontSize="lg">
            暂无可用房间
          </Text>
          <Text color="gray.400" fontSize="sm">
            点击"创建房间"来创建新房间
          </Text>
        </VStack>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} w="100%">
          {rooms.map((room) => (
            <RoomCard key={room.room_id} room={room} />
          ))}
        </SimpleGrid>
      )}

      {/* 加载更多按钮 */}
      {hasMore && (
        <Button
          onClick={loadMore}
          disabled={loading}
          variant="outline"
          colorPalette="blue"
          w="100%"
        >
          {loading ? (
            <>
              <Spinner size="sm" />
              加载中...
            </>
          ) : (
            "加载更多"
          )}
        </Button>
      )}

      {/* 错误提示 */}
      {error && rooms.length > 0 && (
        <Alert.Root status="warning" variant="subtle" size="sm">
          <Alert.Indicator>
            <LuInfo />
          </Alert.Indicator>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      )}
    </VStack>
  );
};

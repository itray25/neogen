import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Card,
  Heading,
  Progress,
  Spinner,
  SimpleGrid,
  Badge,
} from "@chakra-ui/react";
import {
  LuArrowLeft,
  LuLandPlot,
  LuMountain,
  LuTent,
  LuHotel,
  LuLandmark,
} from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../hooks/websocket";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { wsManager } from "../hooks/wsManager";
import { toaster } from "@/components/ui/toaster";
import type { ChatMessage } from "../hooks/wsManager";
import { set } from "react-hook-form";

interface MapTile {
  x: number;
  y: number;
  type: string; // 'w', 't', 'm', 'g', 'v', 'c'
  count: number;
  userId?: string;
  cityType?: string; // 城市类型: 'settlement', 'smallcity', 'largecity'
  hasVision?: boolean; // 是否在视野内
}

interface MoveEvent {
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  move_id: number; // 唯一标识符
  timestamp: number;
  sent?: boolean; // 是否已发送到后端
}

interface MoveTrack {
  id: number;
  moves: MoveEvent[];
  createdAt: number;
}

// 玩家兵力数据接口
interface PlayerPowerData {
  username: string;
  groupId: number;
  totalPower: number;
}

// 玩家兵力显示组件
interface PlayerPowerDisplayProps {
  playerPowers: PlayerPowerData[];
  roomInfo?: any; // 房间信息，包含玩家用户名等
}

const PlayerPowerDisplay: React.FC<PlayerPowerDisplayProps> = ({
  playerPowers,
  roomInfo,
}) => {
  // 获取队伍信息
  const getTeamInfo = (groupId: number) => {
    const teamMap = {
      0: { name: "红队", color: "#FF4444", teamId: "team_0" },
      1: { name: "蓝队", color: "#4444FF", teamId: "team_1" },
      2: { name: "绿队", color: "#44FF44", teamId: "team_2" },
      3: { name: "黄队", color: "#FFFF44", teamId: "team_3" },
      4: { name: "紫队", color: "#FF44FF", teamId: "team_4" },
      5: { name: "青队", color: "#44FFFF", teamId: "team_5" },
      6: { name: "橙队", color: "#FF8844", teamId: "team_6" },
      7: { name: "粉队", color: "#FF8888", teamId: "team_7" },
    };
    return teamMap[groupId as keyof typeof teamMap];
  };

  // 只使用后端提供的真实数据
  const sortedPlayers = playerPowers
    .filter((player) => player.totalPower > 0 && player.groupId < 8) // 排除观众
    .sort((a, b) => b.totalPower - a.totalPower);

  // 如果没有后端数据，显示等待状态
  if (sortedPlayers.length === 0) {
    return (
      <Box
        position="absolute"
        top="70px"
        right="20px"
        backgroundColor="rgba(255, 255, 255, 0.95)"
        border="2px solid rgba(0, 0, 0, 0.1)"
        borderRadius="8px"
        p={4}
        minW="240px"
        boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
        zIndex={15}
      >
        <Text
          fontSize="md"
          fontWeight="bold"
          mb={3}
          color="gray.700"
          textAlign="center"
        >
          兵力排行榜
        </Text>
        <Box textAlign="center" py={4}>
          <Text fontSize="sm" color="gray.500">
            等待后端数据...
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      position="absolute"
      top="70px"
      right="20px"
      backgroundColor="rgba(255, 255, 255, 0.98)"
      border="2px solid rgba(0, 0, 0, 0.1)"
      borderRadius="8px"
      p={3}
      minW="260px"
      maxW="300px"
      boxShadow="0 6px 20px rgba(0, 0, 0, 0.15)"
      zIndex={15}
    >
      <Text
        fontSize="md"
        fontWeight="bold"
        mb={3}
        color="gray.800"
        textAlign="center"
        borderBottom="2px solid"
        borderColor="gray.200"
        pb={2}
      >
        🏆 兵力排行榜
      </Text>

      <VStack gap={2} align="stretch">
        {sortedPlayers.map((player, index) => {
          const teamInfo = getTeamInfo(player.groupId);
          const isFirstPlace = index === 0;
          const teamColor = teamInfo?.color || "#999999";

          return (
            <Box
              key={`${player.groupId}-${player.username}`}
              position="relative"
              borderRadius="8px"
              overflow="hidden"
              border={isFirstPlace ? "3px solid #FFD700" : "2px solid rgba(255, 255, 255, 0.5)"}
              boxShadow={isFirstPlace ? "0 4px 12px rgba(255, 215, 0, 0.4)" : "0 2px 8px rgba(0, 0, 0, 0.15)"}
              transform={isFirstPlace ? "scale(1.02)" : "scale(1)"}
              transition="all 0.2s ease"
            >
              {/* 队伍颜色背景 */}
              <Box
                position="absolute"
                top="0"
                left="0"
                right="0"
                bottom="0"
                bg={teamColor}
                opacity={0.8}
              />
              
              {/* 白色半透明覆盖层提高可读性 */}
              <Box
                position="absolute"
                top="0"
                left="0"
                right="0"
                bottom="0"
                bg="rgba(255, 255, 255, 0.85)"
              />

              <Box position="relative" zIndex={2} p={3}>
                <HStack justify="space-between" align="center">
                  <HStack gap={3}>
                    {/* 排名徽章 */}
                    <Box
                      bg={
                        isFirstPlace
                          ? "linear-gradient(135deg, #FFD700, #FFA500)"
                          : index === 1
                          ? "linear-gradient(135deg, #C0C0C0, #A0A0A0)"
                          : index === 2
                          ? "linear-gradient(135deg, #CD7F32, #B8860B)"
                          : "linear-gradient(135deg, #666666, #555555)"
                      }
                      color="white"
                      fontSize="sm"
                      fontWeight="bold"
                      w="32px"
                      h="32px"
                      borderRadius="full"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      boxShadow="0 2px 6px rgba(0, 0, 0, 0.3)"
                      flexShrink={0}
                    >
                      {isFirstPlace ? "👑" : index + 1}
                    </Box>

                    {/* 玩家信息 */}
                    <VStack align="start" gap={0} flex={1}>
                      <Text
                        fontSize="sm"
                        fontWeight="bold"
                        color="gray.800"
                        lineHeight="1.2"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        maxW="120px"
                      >
                        {player.username}
                      </Text>
                      <Text
                        fontSize="xs"
                        color="gray.600"
                        lineHeight="1"
                        fontWeight="semibold"
                      >
                        {teamInfo?.name || `队伍${player.groupId}`}
                      </Text>
                    </VStack>
                  </HStack>

                  {/* 兵力数值 */}
                  <Box
                    bg={isFirstPlace ? "linear-gradient(135deg, #FFD700, #FFA500)" : teamColor}
                    color="white"
                    px={3}
                    py={2}
                    borderRadius="full"
                    minW="60px"
                    textAlign="center"
                    boxShadow="0 2px 6px rgba(0, 0, 0, 0.3)"
                    flexShrink={0}
                  >
                    <Text fontSize="sm" fontWeight="bold">
                      {player.totalPower}
                    </Text>
                  </Box>
                </HStack>
              </Box>

              {/* 队伍颜色左侧条 */}
              <Box
                position="absolute"
                left="0"
                top="0"
                bottom="0"
                w="5px"
                bg={teamColor}
                zIndex={3}
              />
            </Box>
          );
        })}
      </VStack>

      {/* 底部说明 */}
      <Box
        mt={3}
        pt={2}
        borderTop="1px solid"
        borderColor="gray.200"
        textAlign="center"
      >
        <Text fontSize="xs" color="gray.500" fontWeight="medium">
          📊 实时数据更新
        </Text>
      </Box>
    </Box>
  );
};

    return (
      <Box
        position="absolute"
        top="70px"
        right="20px"
        backgroundColor="rgba(255, 255, 255, 0.95)"
        border="1px solid rgba(229, 231, 235, 0.8)"
        borderRadius="12px"
        p={4}
        minW="220px"
        boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
        backdropFilter="blur(12px)"
        zIndex={15}
      >
        <Text
          fontSize="sm"
          fontWeight="bold"
          mb={3}
          color="gray.700"
          textAlign="center"
        >
          玩家兵力排行 (测试)
        </Text>

        <VStack gap={2} align="stretch">
          {testPlayers.map((player, index) => {
            const teamInfo = getTeamInfo(player.groupId);
            const isFirstPlace = index === 0;

            return (
              <Box
                key={`${player.groupId}-${player.username}`}
                bg={
                  isFirstPlace
                    ? "rgba(255, 215, 0, 0.1)"
                    : "rgba(255, 255, 255, 0.8)"
                }
                border={
                  isFirstPlace
                    ? "1px solid rgba(255, 215, 0, 0.4)"
                    : "1px solid rgba(229, 231, 235, 0.6)"
                }
                borderRadius="8px"
                p={3}
                position="relative"
                overflow="hidden"
              >
                <HStack justify="space-between" position="relative" zIndex={2}>
                  <HStack gap={2}>
                    {/* 排名徽章 */}
                    <Box
                      bg={
                        isFirstPlace
                          ? "linear-gradient(135deg, #FFD700, #FFA500)"
                          : "gray.400"
                      }
                      color="white"
                      fontSize="xs"
                      fontWeight="bold"
                      px={2}
                      py={1}
                      borderRadius="full"
                      minW="24px"
                      textAlign="center"
                      boxShadow="0 2px 4px rgba(0, 0, 0, 0.2)"
                    >
                      {index + 1}
                    </Box>

                    {/* 玩家信息 */}
                    <VStack align="start" gap={0}>
                      <Text
                        fontSize="sm"
                        fontWeight="semibold"
                        color="gray.800"
                        lineHeight="1.2"
                      >
                        {player.username}
                      </Text>
                      <Text fontSize="xs" color="gray.600" lineHeight="1">
                        {teamInfo?.name || `队伍${player.groupId}`}
                      </Text>
                    </VStack>
                  </HStack>

                  {/* 兵力数值 */}
                  <Text
                    fontSize="sm"
                    fontWeight="bold"
                    color={isFirstPlace ? "#B8860B" : "gray.700"}
                  >
                    {player.totalPower}
                  </Text>
                </HStack>
              </Box>
            );
          })}
        </VStack>

        {/* 底部装饰线 */}
        <Box
          mt={3}
          h="2px"
          bg="linear-gradient(90deg, transparent 0%, rgba(102, 126, 234, 0.5) 50%, transparent 100%)"
          borderRadius="1px"
        />
      </Box>
    );
  }

  return (
    <Box
      position="absolute"
      top="70px"
      right="20px"
      backgroundColor="rgba(255, 255, 255, 0.95)"
      border="1px solid rgba(229, 231, 235, 0.8)"
      borderRadius="12px"
      p={4}
      minW="220px"
      boxShadow="0 4px 12px rgba(0, 0, 0, 0.15)"
      backdropFilter="blur(12px)"
      zIndex={15}
    >
      <Text
        fontSize="sm"
        fontWeight="bold"
        mb={3}
        color="gray.700"
        textAlign="center"
      >
        玩家兵力排行
      </Text>

      <VStack gap={2} align="stretch">
        {sortedPlayers.map((player, index) => {
          const teamInfo = getTeamInfo(player.groupId);
          const isFirstPlace = index === 0;
          const isTopThree = index < 3;

          return (
            <Box
              key={`${player.groupId}-${player.username}`}
              bg={
                isFirstPlace
                  ? "rgba(255, 215, 0, 0.1)"
                  : "rgba(255, 255, 255, 0.8)"
              }
              border={
                isFirstPlace
                  ? "1px solid rgba(255, 215, 0, 0.4)"
                  : "1px solid rgba(229, 231, 235, 0.6)"
              }
              borderRadius="8px"
              p={3}
              position="relative"
              overflow="hidden"
            >
              {/* 背景渐变 */}
              <Box
                position="absolute"
                top="0"
                left="0"
                right="0"
                bottom="0"
                bg={`linear-gradient(135deg, ${teamInfo?.color}15 0%, transparent 70%)`}
                borderRadius="8px"
              />

              <HStack justify="space-between" position="relative" zIndex={2}>
                <HStack gap={2}>
                  {/* 排名徽章 */}
                  <Box
                    bg={
                      isFirstPlace
                        ? "linear-gradient(135deg, #FFD700, #FFA500)"
                        : isTopThree
                          ? `linear-gradient(135deg, ${teamInfo?.color}, ${teamInfo?.color}80)`
                          : "gray.400"
                    }
                    color="white"
                    fontSize="xs"
                    fontWeight="bold"
                    px={2}
                    py={1}
                    borderRadius="full"
                    minW="24px"
                    textAlign="center"
                    boxShadow="0 2px 4px rgba(0, 0, 0, 0.2)"
                  >
                    {index + 1}
                  </Box>

                  {/* 玩家信息 */}
                  <VStack align="start" gap={0}>
                    <Text
                      fontSize="sm"
                      fontWeight="semibold"
                      color="gray.800"
                      lineHeight="1.2"
                    >
                      {player.username}
                    </Text>
                    <Text fontSize="xs" color="gray.600" lineHeight="1">
                      {teamInfo?.name || `队伍${player.groupId}`}
                    </Text>
                  </VStack>
                </HStack>

                {/* 兵力数值 */}
                <Text
                  fontSize="sm"
                  fontWeight="bold"
                  color={isFirstPlace ? "#B8860B" : "gray.700"}
                >
                  {player.totalPower}
                </Text>
              </HStack>
            </Box>
          );
        })}
      </VStack>

      {/* 底部装饰线 */}
      <Box
        mt={3}
        h="2px"
        bg="linear-gradient(90deg, transparent 0%, rgba(102, 126, 234, 0.5) 50%, transparent 100%)"
        borderRadius="1px"
      />
    </Box>
  );
};

const GamePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { gameState } = useWebSocket();

  // 确保WebSocket连接和用户认证
  useAuthenticatedWebSocket();

  // 添加CSS动画样式
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      
      @keyframes arrow-flow {
        0% { stroke-dashoffset: 20; }
        100% { stroke-dashoffset: 0; }
      }
      
      .arrow-animated {
        stroke-dasharray: 5,5;
        animation: arrow-flow 1s linear infinite;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [turnHalf, setTurnHalf] = useState(true);
  const [turnActions, setTurnActions] = useState<[string, string][]>([]);
  const [lastActionSent, setLastActionSent] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [gameMap, setGameMap] = useState<MapTile[]>([]);
  const [selectedTile, setSelectedTile] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isConstructingTrack, setIsConstructingTrack] = useState(false);
  const [playerTeam, setPlayerTeam] = useState<string>("");
  const [playerGroupId, setPlayerGroupId] = useState<number | null>(null);
  const [isObserver, setIsObserver] = useState<boolean>(false);

  // 玩家兵力数据和房间信息
  const [playerPowers, setPlayerPowers] = useState<PlayerPowerData[]>([]);
  const [roomInfo, setRoomInfo] = useState<any>(null);

  // 移动轨迹缓存（支持多个轨迹）
  const [moveTracks, setMoveTracks] = useState<MoveTrack[]>([]);
  const [nextTrackId, setNextTrackId] = useState<number>(1);

  // 记录已发现的城市类型（即使失去视野也记住）
  const [discoveredCities, setDiscoveredCities] = useState<Map<string, string>>(
    new Map()
  );
  // 唯一moveid，保证确认信息正确
  const [curMoveId, setCurMoveId] = useState<number>(0);
  // 定时器引用
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 ref 保存最新状态，避免定时器频繁重建
  const moveTracksRef = useRef(moveTracks);
  const gameMapRef = useRef(gameMap);
  const playerTeamRef = useRef(playerTeam);
  const playerGroupIdRef = useRef(playerGroupId);
  const gameStartedRef = useRef(gameStarted);
  const gameEndedRef = useRef(gameEnded);

  // 保持 ref 与状态同步
  useEffect(() => {
    moveTracksRef.current = moveTracks;
  }, [moveTracks]);

  useEffect(() => {
    gameMapRef.current = gameMap;
  }, [gameMap]);

  useEffect(() => {
    playerTeamRef.current = playerTeam;
  }, [playerTeam]);

  useEffect(() => {
    playerGroupIdRef.current = playerGroupId;
  }, [playerGroupId]);

  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);

  useEffect(() => {
    gameEndedRef.current = gameEnded;
  }, [gameEnded]);

  // 根据组别ID获取队伍信息
  const getTeamInfo = (groupId: number | null) => {
    const teamMap = {
      0: { name: "红队", color: "red", teamId: "team_0" },
      1: { name: "蓝队", color: "blue", teamId: "team_1" },
      2: { name: "绿队", color: "green", teamId: "team_2" },
      3: { name: "黄队", color: "yellow", teamId: "team_3" },
      4: { name: "紫队", color: "purple", teamId: "team_4" },
      5: { name: "青队", color: "cyan", teamId: "team_5" },
      6: { name: "橙队", color: "orange", teamId: "team_6" },
      7: { name: "粉队", color: "pink", teamId: "team_7" },
      8: { name: "观察者", color: "gray", teamId: "observer" },
    };

    if (groupId === null || groupId === undefined) {
      return { name: "未分配", color: "gray", teamId: "" };
    }

    return (
      teamMap[groupId as keyof typeof teamMap] || {
        name: "未知",
        color: "gray",
        teamId: "",
      }
    );
  };

  // 获取当前玩家的队伍信息 - 添加更多依赖项确保及时更新
  useEffect(() => {
    if (roomId) {
      const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
      console.log("更新玩家队伍信息:", {
        roomId,
        currentGroupId,
        currentGroupIdType: typeof currentGroupId,
        currentGroupIdStrictlyEquals0: currentGroupId === 0,
        currentUser: wsManager.getCurrentUser(),
        isConnected: wsManager.isConnected(),
      });

      setPlayerGroupId(currentGroupId);

      if (currentGroupId !== null && currentGroupId !== undefined) {
        const teamInfo = getTeamInfo(currentGroupId);
        setPlayerTeam(teamInfo.teamId);
        setIsObserver(currentGroupId === 8); // 组别8为观众
        console.log("设置玩家队伍:", {
          groupId: currentGroupId,
          groupIdType: typeof currentGroupId,
          teamInfo,
          isObserver: currentGroupId === 8,
        });
      } else {
        // 如果没有队伍信息，自动分配为观众
        console.log("玩家没有队伍信息，自动分配为观众");
        setPlayerTeam("");
        setIsObserver(true);

        // 如果已连接且认证成功，请求切换到观众组
        if (wsManager.isConnected() && user && roomId) {
          console.log("自动请求切换到观众组");
          wsManager.changeGroup(roomId, 8); // 请求切换到观众组
        }

        console.log("设置为观众模式 - currentGroupId为null或undefined:", {
          currentGroupId,
          currentGroupIdType: typeof currentGroupId,
        });
      }
    }
  }, [roomId, isAuthenticated, user]); // 添加认证状态依赖项

  // 定期检查队伍信息（防止WebSocket消息丢失）
  useEffect(() => {
    if (!roomId) return;

    const checkTeamInfo = () => {
      const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
      const currentUser = wsManager.getCurrentUser();
      /*
      console.log("定期检查队伍信息:", {
        currentGroupId,
        playerGroupId,
        currentUser,
        isConnected: wsManager.isConnected(),
      });
*/
      // 如果当前没有队伍信息但应该有，更新它
      if (currentGroupId !== null && currentGroupId !== playerGroupId) {
        console.log("检测到队伍信息变化，更新:", {
          old: playerGroupId,
          new: currentGroupId,
          isGroupZero: currentGroupId === 0,
        });
        setPlayerGroupId(currentGroupId);
        const teamInfo = getTeamInfo(currentGroupId);
        setPlayerTeam(teamInfo.teamId);
        setIsObserver(currentGroupId === 8);
      } else if (
        currentGroupId === null &&
        playerGroupId !== 8 &&
        wsManager.isConnected()
      ) {
        // 如果没有队伍信息且不是观众，自动分配为观众
        console.log("定期检查发现没有队伍信息，自动请求切换到观众组");
        wsManager.changeGroup(roomId, 8);
      }
    };

    // 立即检查一次
    checkTeamInfo();

    // 每3秒检查一次
    const interval = setInterval(checkTeamInfo, 3000);

    return () => clearInterval(interval);
  }, [roomId, playerGroupId]);

  // 监听游戏状态变化
  useEffect(() => {
    console.log("游戏状态变化:", {
      gameStarted,
      gameEnded,
      playerTeam,
      playerGroupId,
      mapLength: gameMap.length,
    });
  }, [gameStarted, gameEnded, playerTeam, playerGroupId, gameMap.length]);

  // 验证移动是否可执行（检查起始位置是否有足够兵力且属于玩家）
  const canExecuteMove = (
    move: MoveEvent,
    currentMap: MapTile[],
    currentTeam: string
  ): boolean => {
    console.log("验证移动:", {
      move,
      currentTeam,
      mapLength: currentMap.length,
    });

    const fromTile = currentMap.find(
      (tile) => tile.x === move.from_x && tile.y === move.from_y
    );

    const toTile = currentMap.find(
      (tile) => tile.x === move.to_x && tile.y === move.to_y
    );

    console.log("找到起始瓦片:", fromTile);
    console.log("找到目标瓦片:", toTile);

    if (!fromTile) {
      console.log("未找到起始瓦片");
      return false;
    }

    if (!toTile) {
      console.log("未找到目标瓦片");
      return false;
    }

    // 检查目标是否是山地或void
    if (toTile.type === "m") {
      console.log("无法移动到山地");
      return false;
    }

    if (toTile.type === "v") {
      console.log("无法移动到空白区域");
      return false;
    } // 检查是否是玩家控制的瓦片
    if (fromTile.userId !== currentTeam) {
      console.log("瓦片不属于当前队伍:", {
        fromTileUserId: fromTile.userId,
        currentTeam,
      });
      return false;
    }

    // 检查是否有足够兵力（需要至少2兵力才能移动1兵力）
    if (fromTile.count <= 1) {
      console.log("兵力不足:", { count: fromTile.count });
      return false;
    }

    console.log("移动验证通过");
    return true;
  };

  // 定时器：每1秒检查并发送移动事件（优化：使用ref避免重建）
  useEffect(() => {
    // 清理之前的定时器
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
    }

    // 启动新的定时器：每1秒检查并发送移动事件
    sendIntervalRef.current = setInterval(() => {
      const currentTracks = moveTracksRef.current;
      const currentMap = gameMapRef.current;
      const currentTeam = playerTeamRef.current;
      const currentGameStarted = gameStartedRef.current;
      const currentGameEnded = gameEndedRef.current;
      /*
      console.log("定时器检查状态:", {
        tracksCount: currentTracks.length,
        gameStarted: currentGameStarted,
        gameEnded: currentGameEnded,
        team: currentTeam,
        mapLength: currentMap.length,
      });
*/
      // 检查是否有游戏数据（地图和队伍）
      const hasGameData = currentMap.length > 0 && currentTeam;

      // 只有在游戏开始（或有游戏数据）且未结束时才处理移动事件
      if ((!currentGameStarted && !hasGameData) || currentGameEnded) {
        console.log("游戏未开始或已结束，跳过移动处理", {
          gameStarted: currentGameStarted,
          hasGameData,
          gameEnded: currentGameEnded,
        });
        return;
      }

      if (currentTracks.length > 0) {
        const currentTrack = currentTracks[0];
        console.log("检查当前轨迹:", currentTrack);
        console.log("轨迹详细信息:", {
          tracksLength: currentTracks.length,
          firstTrackId: currentTrack?.id,
          firstTrackMoves: currentTrack?.moves?.length,
          allTracks: currentTracks.map((t) => ({
            id: t.id,
            movesCount: t.moves.length,
          })),
        });

        if (
          currentTrack &&
          currentTrack.moves &&
          currentTrack.moves.length > 0
        ) {
          const moveToSend = currentTrack.moves[0];

          // 只发送未发送的移动
          if (!moveToSend.sent) {
            console.log("准备发送移动:", moveToSend);

            // 验证移动是否可执行
            if (canExecuteMove(moveToSend, currentMap, currentTeam)) {
              console.log("移动验证通过，即将发送");
              // 发送到后端
              sendMove(
                moveToSend.from_x,
                moveToSend.from_y,
                moveToSend.to_x,
                moveToSend.to_y,
                moveToSend.move_id
              );

              console.log("发送移动事件:", moveToSend);
              console.log("当前队伍:", currentTeam);
              console.log("游戏状态:", {
                started: currentGameStarted,
                ended: currentGameEnded,
              });

              // 标记为已发送，等待map_update确认
              setMoveTracks((prev) => {
                const newTracks = [...prev];
                if (
                  newTracks.length > 0 &&
                  newTracks[0] &&
                  newTracks[0].moves &&
                  newTracks[0].moves.length > 0
                ) {
                  newTracks[0] = {
                    ...newTracks[0],
                    moves: newTracks[0].moves.map((move, index) =>
                      index === 0 ? { ...move, sent: true } : move
                    ),
                  };
                }
                moveTracksRef.current = newTracks;
                return newTracks;
              });
            } else {
              console.log("移动无法执行，删除整个轨迹:", moveToSend);

              // 删除当前整个轨迹
              setMoveTracks((prev) => prev.slice(1));

              toaster.create({
                title: "移动失败",
                description: `无法执行移动 (${moveToSend.from_x},${moveToSend.from_y}) → (${moveToSend.to_x},${moveToSend.to_y})，已删除相关轨迹`,
                type: "warning",
                duration: 2000,
              });
            }
          } else {
            console.log("移动已发送，等待服务器确认:", moveToSend);
          }
        } else {
          // 当前轨迹为空，删除它
          setMoveTracks((prev) => prev.slice(1));
        }
      }
    }, 500); // 改为500毫秒间隔，降低频率

    // 清理函数
    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, []); // 空依赖数组，避免定时器重建

  // 取消轨迹构建
  const cancelTrackConstruction = () => {
    setSelectedTile(null);
    setIsConstructingTrack(false);
  };

  // 清空所有移动轨迹缓存
  const clearAllMoveTracks = () => {
    setMoveTracks([]);
    setSelectedTile(null);
    setIsConstructingTrack(false);
  };

  // 初始化：请求房间信息检查游戏状态
  useEffect(() => {
    if (roomId && !isInitialized) {
      console.log("初始化游戏页面，请求房间信息:", roomId);
      setIsInitialized(true);
      wsManager.send({
        type: "get_room_info",
        room_id: roomId,
      });
    }
  }, [roomId, isInitialized]);

  // 发送游戏动作
  const sendAction = (action: string) => {
    // 使用 ref 中的最新状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    const hasGameData = currentMap.length > 0 && currentTeam;

    if (!roomId || (!currentGameStarted && !hasGameData) || currentGameEnded)
      return;

    wsManager.sendGameAction(roomId, action);
    setLastActionSent(action);

    toaster.create({
      title: "动作已发送",
      description: `已发送动作：${action}`,
      type: "success",
      duration: 1000,
    });
  };
  const genMoveId = () => {
    const newId = curMoveId + 1;
    setCurMoveId(newId);
    return newId;
  };
  // 发送移动命令（已禁用乐观更新，等待权威数据）
  const sendMove = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    moveId: number
  ) => {
    // 使用 ref 中的最新状态，而不是 React 状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    // 如果有地图数据和队伍信息，但 gameStarted 仍为 false，可能是状态同步问题
    const hasGameData = currentMap.length > 0 && currentTeam;

    if (!roomId || (!currentGameStarted && !hasGameData) || currentGameEnded) {
      console.log("sendMove 被阻止:", {
        roomId,
        gameStarted: currentGameStarted,
        gameEnded: currentGameEnded,
        hasGameData,
        mapLength: currentMap.length,
        playerTeam: currentTeam,
      });
      return;
    }

    console.log("调用 wsManager.sendGameMove:", {
      roomId,
      fromX,
      fromY,
      toX,
      toY,
    });
    // 禁用乐观更新，直接发送到后端，等待权威地图更新
    wsManager.sendGameMove(roomId, fromX, fromY, toX, toY, moveId);

    toaster.create({
      title: "移动命令已发送",
      description: `从 (${fromX},${fromY}) 移动到 (${toX},${toY})`,
      type: "success",
      duration: 1000,
    });
  };

  // 键盘控制移动
  const handleKeyDown = (event: KeyboardEvent) => {
    // 观众模式下禁用键盘控制
    if (isObserver) return;

    // 使用 ref 中的最新状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    const hasGameData = currentMap.length > 0 && currentTeam;

    if (
      (!currentGameStarted && !hasGameData) ||
      currentGameEnded ||
      !selectedTile
    )
      return;

    let newX = selectedTile.x;
    let newY = selectedTile.y;

    switch (event.key.toLowerCase()) {
      case "w": // 向上移动
      case "arrowup":
        newY = Math.max(0, selectedTile.y - 1);
        break;
      case "s": // 向下移动
      case "arrowdown":
        newY = Math.min(9, selectedTile.y + 1);
        break;
      case "a": // 向左移动
      case "arrowleft":
        newX = Math.max(0, selectedTile.x - 1);
        break;
      case "d": // 向右移动
      case "arrowright":
        newX = Math.min(9, selectedTile.x + 1);
        break;
      case "escape": // ESC 取消选择
        cancelTrackConstruction();
        return;
      case "c": // C 键清空队列
        clearAllMoveTracks();
        return;
      default:
        return;
    }

    // 如果位置没有变化，忽略
    if (newX === selectedTile.x && newY === selectedTile.y) return;

    // 阻止默认行为
    event.preventDefault();

    // 执行移动
    handleTileClick(newX, newY);
  };

  // 监听键盘事件
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedTile, gameStarted, gameEnded]);

  // 检查移动是否合法（只能移动到相邻格子）
  const isValidMove = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) => {
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    // 只允许移动到相邻的格子（上下左右，不包括斜对角）
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  };

  // 检查瓦片是否可以被玩家选择作为起点
  const canSelectTile = (x: number, y: number): boolean => {
    const tile = gameMap.find((t) => t.x === x && t.y === y);
    if (!tile) {
      console.log(`canSelectTile: 未找到瓦片 (${x}, ${y})`);
      return false;
    }

    console.log(`canSelectTile: 检查瓦片 (${x}, ${y})`, {
      tile,
      playerTeam,
      playerGroupId,
      match: tile.userId === playerTeam,
    });

    // 只能选择自己控制的领地(t)、王城(g)或城市(c)，且需要有足够兵力移动
    if (tile.type === "t" || tile.type === "g" || tile.type === "c") {
      const isOwned = tile.userId === playerTeam;
      const hasEnoughTroops = tile.count > 1;

      console.log(`canSelectTile: 详细检查`, {
        tileType: tile.type,
        tileUserId: tile.userId,
        playerTeam,
        isOwned,
        hasEnoughTroops,
        tileCount: tile.count,
      });

      return isOwned && hasEnoughTroops;
    }

    return false;
  };

  // 处理瓦片点击 - 构建移动轨迹
  const handleTileClick = (x: number, y: number) => {
    // 观众模式下禁用所有操作
    if (isObserver) {
      toaster.create({
        title: "观众模式",
        description: "观众无法操作游戏，只能观看",
        type: "info",
        duration: 2000,
      });
      return;
    }

    // 检查点击的格子类型，山和占位符不能被点击
    const clickedTile = gameMap.find((tile) => tile.x === x && tile.y === y);
    if (clickedTile && (clickedTile.type === "m" || clickedTile.type === "v")) {
      toaster.create({
        title: "无法操作",
        description:
          clickedTile.type === "m" ? "山地无法操作" : "此区域无法操作",
        type: "warning",
        duration: 2000,
      });
      return;
    }

    // 使用 ref 中的最新状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    const hasGameData = currentMap.length > 0 && currentTeam;

    if ((!currentGameStarted && !hasGameData) || currentGameEnded) {
      console.log("游戏未开始或已结束，无法点击瓦片", {
        gameStarted: currentGameStarted,
        hasGameData,
        gameEnded: currentGameEnded,
      });
      return;
    }

    if (!selectedTile) {
      // 第一次点击：选择起始瓦片，需要检查权限
      if (!canSelectTile(x, y)) {
        toaster.create({
          title: "无法选择",
          description: `无法选择此位置 (${x},${y})，只能选择自己控制且有足够兵力的领地或王城`,
          type: "warning",
          duration: 2000,
        });
        return;
      }

      setSelectedTile({ x, y });
      setIsConstructingTrack(true);
      toaster.create({
        title: "选择起点",
        description: `已选择起点 (${x},${y})，请选择目标位置`,
        type: "info",
        duration: 1500,
      });
    } else {
      // 检查是否与当前选择的位置相邻
      const isAdjacent = isValidMove(selectedTile.x, selectedTile.y, x, y);

      if (!isAdjacent) {
        // 如果不相邻，检查是否可以选择为新的起点
        if (!canSelectTile(x, y)) {
          toaster.create({
            title: "无法选择",
            description: `无法选择此位置 (${x},${y})，只能选择自己控制且有足够兵力的领地或王城`,
            type: "warning",
            duration: 2000,
          });
          return;
        }

        // 将点击的位置设为新的起点
        setSelectedTile({ x, y });
        setIsConstructingTrack(true);

        toaster.create({
          title: "重新选择起点",
          description: `位置不相邻，已将 (${x},${y}) 设为新起点`,
          type: "info",
          duration: 1500,
        });
        return;
      }

      // 创建移动事件
      const newMove: MoveEvent = {
        from_x: selectedTile.x,
        from_y: selectedTile.y,
        to_x: x,
        to_y: y,
        move_id: genMoveId(),
        timestamp: Date.now(),
      };

      // 检查是否可以添加到现有轨迹 - 使用ref获取最新状态
      const currentMoveTracks = moveTracksRef.current;
      const lastTrack = currentMoveTracks[currentMoveTracks.length - 1];
      let shouldCreateNewTrack = true;

      console.log("轨迹连接检查:", {
        moveTracksLength: currentMoveTracks.length,
        lastTrack,
        newMove,
        selectedTile,
        usingRef: true,
      });

      if (lastTrack && lastTrack.moves && lastTrack.moves.length > 0) {
        // 检查是否可以连接到最后一个轨迹
        const lastMove = lastTrack.moves[lastTrack.moves.length - 1];
        console.log("检查轨迹连接:", {
          lastMove,
          canConnect:
            lastMove.to_x === newMove.from_x &&
            lastMove.to_y === newMove.from_y,
        });

        if (
          lastMove.to_x === newMove.from_x &&
          lastMove.to_y === newMove.from_y
        ) {
          // 可以连接到现有轨迹
          shouldCreateNewTrack = false;
          console.log("连接到现有轨迹");
          setMoveTracks((prev) => {
            const newTracks = [...prev];
            const lastIndex = newTracks.length - 1;
            if (lastIndex >= 0 && newTracks[lastIndex]) {
              newTracks[lastIndex] = {
                ...newTracks[lastIndex],
                moves: [...newTracks[lastIndex].moves, newMove],
              };
            }
            // 立即更新ref以确保定时器能看到最新状态
            moveTracksRef.current = newTracks;
            return newTracks;
          });
        }
      }

      if (shouldCreateNewTrack) {
        console.log("创建新轨迹:", newMove);
        // 创建新轨迹
        const newTrack: MoveTrack = {
          id: nextTrackId,
          moves: [newMove],
          createdAt: Date.now(),
        };

        setMoveTracks((prev) => {
          const newTracks = [...prev, newTrack];
          // 立即更新ref以确保定时器能看到最新状态
          moveTracksRef.current = newTracks;
          return newTracks;
        });
        setNextTrackId((prev) => prev + 1);
      }

      console.log("添加移动到轨迹:", newMove);
      console.log("当前游戏状态:", {
        moveTracks:
          moveTracksRef.current.length + (shouldCreateNewTrack ? 1 : 0),
        playerTeam,
        gameStarted: currentGameStarted,
        gameEnded: currentGameEnded,
        mapLength: currentMap.length,
        hasGameData: currentMap.length > 0 && playerTeam,
        shouldCreateNewTrack,
        nextTrackId,
        actualRefLength: moveTracksRef.current.length,
      });
      console.log(
        "当前移动轨迹数量:",
        moveTracksRef.current.length + (shouldCreateNewTrack ? 1 : 0)
      );

      toaster.create({
        title: "添加移动",
        description: `从 (${selectedTile.x},${selectedTile.y}) 到 (${x},${y})`,
        type: "success",
        duration: 1000,
      });

      // 将目标位置设为新的起始位置，方便连续移动
      setSelectedTile({ x, y });
    }
  };

  // 获取格子在地图中的像素位置
  const getTilePosition = (x: number, y: number) => {
    const tileSize = 60; // 600px / 10 = 60px per tile
    return {
      x: x * tileSize + tileSize / 2, // 中心位置
      y: y * tileSize + tileSize / 2,
    };
  };

  // 渲染移动箭头 - 现代化简洁版本
  const renderMoveArrows = () => {
    const arrows: JSX.Element[] = [];
    let arrowId = 0;

    moveTracks.forEach((track, trackIndex) => {
      if (track && track.moves && track.moves.length > 0) {
        // 合并连续的同方向移动为路径
        const paths: {
          points: { x: number; y: number }[];
          isFirst: boolean;
        }[] = [];
        let currentPath: { x: number; y: number }[] = [];

        track.moves.forEach((move, moveIndex) => {
          const fromPos = getTilePosition(move.from_x, move.from_y);
          const toPos = getTilePosition(move.to_x, move.to_y);

          if (currentPath.length === 0) {
            // 开始新路径
            currentPath = [fromPos, toPos];
          } else {
            // 检查是否可以连接到当前路径
            const lastPoint = currentPath[currentPath.length - 1];
            if (lastPoint.x === fromPos.x && lastPoint.y === fromPos.y) {
              // 可以连接，添加到当前路径
              currentPath.push(toPos);
            } else {
              // 不能连接，完成当前路径并开始新路径
              if (currentPath.length > 0) {
                paths.push({
                  points: [...currentPath],
                  isFirst: trackIndex === 0 && paths.length === 0,
                });
              }
              currentPath = [fromPos, toPos];
            }
          }
        });

        // 添加最后一个路径
        if (currentPath.length > 0) {
          paths.push({
            points: [...currentPath],
            isFirst: trackIndex === 0 && paths.length === 0,
          });
        }

        // 渲染路径
        paths.forEach((path, pathIndex) => {
          const isCurrentTrack = trackIndex === 0;
          const isFirstPath = path.isFirst;

          // 更现代的颜色方案，避免与红队和橙队冲突
          const color = isFirstPath
            ? "#8b5cf6" // 紫色 - 即将执行
            : isCurrentTrack
              ? "#06b6d4" // 青色 - 当前轨迹
              : "#6b7280"; // 灰色 - 其他轨迹

          const opacity = isFirstPath ? 0.6 : isCurrentTrack ? 0.5 : 0.3; // 降低透明度避免遮挡兵力数字
          const strokeWidth = isFirstPath ? 3 : 2;

          // 生成路径字符串
          let pathString = `M ${path.points[0].x} ${path.points[0].y}`;
          for (let i = 1; i < path.points.length; i++) {
            pathString += ` L ${path.points[i].x} ${path.points[i].y}`;
          }

          arrows.push(
            <g key={`path-${arrowId++}`}>
              {/* 主路径 */}
              <path
                d={pathString}
                stroke={color}
                strokeWidth={strokeWidth}
                opacity={opacity}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#arrowhead)"
                className={isFirstPath ? "arrow-animated" : ""}
              />

              {/* 起点标记 */}
              <circle
                cx={path.points[0].x}
                cy={path.points[0].y}
                r={isFirstPath ? 4 : 3}
                fill={color}
                opacity={opacity * 0.8}
              />

              {/* 终点标记（箭头已经在markerEnd中） */}
              {path.points.length > 2 && (
                <circle
                  cx={path.points[path.points.length - 1].x}
                  cy={path.points[path.points.length - 1].y}
                  r={2}
                  fill={color}
                  opacity={opacity * 0.6}
                />
              )}
            </g>
          );
        });
      }
    });

    return arrows;
  };

  // 获取格子显示颜色
  const getTileColor = (tile: MapTile) => {
    // 不再在颜色中处理选中状态，改用边框高亮
    switch (tile.type) {
      case "w":
        return "gray.50"; // 无主地，浅灰色背景
      case "t":
        // 根据 userId 获取对应的颜色，与g保持一致
        if (tile.userId?.startsWith("team_")) {
          const groupId = parseInt(tile.userId.replace("team_", ""));
          const teamInfo = getTeamInfo(groupId);
          return `${teamInfo.color}.500`; // 与g保持一致，不再使用.300
        }
        return "gray.400";
      case "g":
        // 根据 userId 获取对应的颜色
        if (tile.userId?.startsWith("team_")) {
          const groupId = parseInt(tile.userId.replace("team_", ""));
          const teamInfo = getTeamInfo(groupId);
          return `${teamInfo.color}.500`;
        }
        return "gray.400";
      case "c":
        // 城市颜色
        if (!tile.hasVision) {
          return "gray.400"; // 未探过的城市使用浅一些的颜色，与山区分
        }
        if (tile.userId?.startsWith("team_")) {
          const groupId = parseInt(tile.userId.replace("team_", ""));
          const teamInfo = getTeamInfo(groupId);
          return `${teamInfo.color}.500`;
        }
        return "gray.400"; // 无主城市为深灰色，与山保持一致
      case "m":
        return "gray.400"; // 山，使用浅灰色与未探过的城市保持一致
      case "v":
        return "transparent"; // 空白，完全透明
      default:
        return "gray.100";
    }
  };

  // 获取格子显示文本
  const getTileText = (tile: MapTile) => {
    switch (tile.type) {
      case "w":
        return ""; // 无主地不显示文本
      case "t":
        return (
          <Box position="relative" w="100%" h="100%">
            <Text
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              color="white"
              fontWeight="bold"
              fontSize="sm"
              zIndex={2}
            >
              {tile.count}
            </Text>
          </Box>
        );
      case "g":
        return (
          <Box position="relative" w="100%" h="100%">
            <LuLandPlot
              size={28}
              color="#3a3a3c"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 1,
              }}
            />
            <Text
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              color="white"
              fontWeight="bold"
              fontSize="sm"
              zIndex={2}
            >
              {tile.count}
            </Text>
          </Box>
        );
      case "c":
        // 城市
        // 获取已发现的城市类型
        const key = `${tile.x},${tile.y}`;
        const discoveredType = discoveredCities.get(key);

        // 如果没有视野，检查是否曾经被发现过
        if (!tile.hasVision) {
          // 如果曾经被发现过，显示对应的城市图标
          if (discoveredType) {
            return (
              <Box position="relative" w="100%" h="100%">
                <Box
                  position="absolute"
                  top="50%"
                  left="50%"
                  transform="translate(-50%, -50%)"
                  zIndex={1}
                >
                  {(() => {
                    switch (discoveredType) {
                      case "settlement":
                        return <LuTent size={42} color="gray.600" />;
                      case "smallcity":
                        return <LuHotel size={42} color="gray.600" />;
                      case "largecity":
                        return <LuLandmark size={42} color="gray.600" />;
                      default:
                        return <LuTent size={42} color="gray.600" />;
                    }
                  })()}
                </Box>
                <Text
                  position="absolute"
                  top="50%"
                  left="50%"
                  transform="translate(-50%, -50%)"
                  color="white"
                  fontWeight="bold"
                  fontSize="sm"
                  zIndex={2}
                >
                  ?
                </Text>
              </Box>
            );
          } else {
            // 从未被发现过，显示为普通山（与未探过山tile完全一样）
            return (
              <Box position="relative" w="100%" h="100%">
                <LuMountain
                  size={36}
                  color="gray.500"
                  style={{
                    position: "absolute",
                    top: "55%",
                    left: "45%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                <Text
                  position="absolute"
                  top="15%"
                  right="15%"
                  color="gray.600"
                  fontSize="sm"
                  fontWeight="bold"
                  zIndex={2}
                >
                  ?
                </Text>
              </Box>
            );
          }
        }

        // 有视野时，显示城市图标和兵力数
        return (
          <Box position="relative" w="100%" h="100%">
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              zIndex={1}
            >
              {(() => {
                const currentType = tile.cityType || discoveredType;
                switch (currentType) {
                  case "settlement":
                    return <LuTent size={42} color="gray.600" />;
                  case "smallcity":
                    return <LuHotel size={42} color="gray.600" />;
                  case "largecity":
                    return <LuLandmark size={42} color="gray.600" />;
                  default:
                    return <LuTent size={42} color="gray.600" />;
                }
              })()}
            </Box>
            <Text
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              color="white"
              fontWeight="bold"
              fontSize="sm"
              zIndex={2}
            >
              {tile.count}
            </Text>
          </Box>
        );
      case "m":
        // 山脉 - 根据视野状态显示不同的样式
        if (tile.hasVision) {
          // 有视野的山，显示正常的山图标
          return <LuMountain size={42} color="gray.600" />;
        } else {
          // 未探过的山显示缩小的山图标和右上角问号
          return (
            <Box position="relative" w="100%" h="100%">
              <LuMountain
                size={36}
                color="gray.500"
                style={{
                  position: "absolute",
                  top: "55%",
                  left: "45%",
                  transform: "translate(-50%, -50%)",
                }}
              />
              <Text
                position="absolute"
                top="15%"
                right="15%"
                color="gray.600"
                fontSize="sm"
                fontWeight="bold"
                zIndex={2}
              >
                ?
              </Text>
            </Box>
          );
        }
      case "v":
        return "";
      default:
        return "?";
    }
  };

  // 监听WebSocket消息
  useEffect(() => {
    const unsubscribeMessages = wsManager.subscribeToMessages(
      (message: ChatMessage) => {
        switch (message.type) {
          case "room_info":
            console.log("收到 room_info 消息:", message);

            // 存储房间信息
            setRoomInfo(message);

            // 尝试从房间信息中设置玩家兵力数据
            if (message.players && playerPowers.length === 0) {
              const mockPlayerPowers: PlayerPowerData[] = message.players
                .filter((player: any) => player.group_id < 8) // 排除观众
                .map((player: any) => ({
                  username: player.username || `玩家${player.group_id}`,
                  groupId: player.group_id,
                  totalPower: Math.floor(Math.random() * 100) + 50, // 临时随机兵力
                }));
              console.log("从 room_info 设置玩家兵力数据:", mockPlayerPowers);
              setPlayerPowers(mockPlayerPowers);
            }

            // 检查房间状态，如果是playing说明游戏正在进行
            if (message.room_id == roomId && message.status === "playing") {
              console.log("设置游戏开始状态为 true");
              setGameStarted(true);
              setGameEnded(false);
            } else if (
              message.room_id == roomId &&
              message.status !== "playing"
            ) {
              console.log("游戏未开始，房间状态:", message.status);
              // 游戏不在进行中，返回房间页面
              toaster.create({
                title: "游戏未开始",
                description: "当前没有游戏在进行，返回房间",
                type: "info",
              });
              setTimeout(() => {
                navigate(`/rooms/${roomId}`);
              }, 1000);
            }

            // 更新玩家组别信息
            if (message.room_id == roomId && roomId) {
              const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
              if (currentGroupId !== null && currentGroupId !== playerGroupId) {
                setPlayerGroupId(currentGroupId);
                const teamInfo = getTeamInfo(currentGroupId);
                setPlayerTeam(teamInfo.teamId);
                console.log("从 room_info 更新玩家队伍信息:", {
                  groupId: currentGroupId,
                  teamInfo,
                });
              }
            }
            break;

          case "start_game":
            console.log("收到 start_game 消息:", message);
            if (message.room_id == roomId) {
              console.log("设置游戏开始状态为 true (start_game)");
              setGameStarted(true);
              setGameEnded(false);
              setCurrentTurn(0);
              setTurnHalf(true);
              setTurnActions([]);
              setLastActionSent("");
              toaster.create({
                title: "游戏开始",
                description: "游戏正在进行中...",
                type: "success",
              });
            }
            break;

          case "game_turn_update":
            //console.log("收到 game_turn_update 消息:", message);
            if (message.room_id == roomId) {
              const newTurn = message.turn || 0;
              const newTurnHalf = message.turn_half ?? true;

              setCurrentTurn(newTurn);
              setTurnHalf(newTurnHalf);
              setTurnActions(message.actions || []);

              // 如果收到game_turn_update但游戏还没开始，说明游戏已经在进行
              if (!gameStarted) {
                console.log("通过 game_turn_update 设置游戏开始状态为 true");
                setGameStarted(true);
                setGameEnded(false);
              }

              // 临时模拟数据 - 实际应由后端提供
              if (playerPowers.length === 0) {
                // 从房间信息获取玩家数据（如果有的话）
                if (roomInfo && roomInfo.players) {
                  const mockPlayerPowers: PlayerPowerData[] = roomInfo.players
                    .filter((player: any) => player.group_id < 8) // 排除观众
                    .map((player: any, index: number) => ({
                      username: player.username || `玩家${player.group_id}`,
                      groupId: player.group_id,
                      totalPower: Math.floor(Math.random() * 100) + 50, // 临时随机兵力
                    }));
                  setPlayerPowers(mockPlayerPowers);
                }
              }
            }
            break;

          case "map_update":
            //console.log("收到 map_update 消息:", message);
            if (message.room_id == roomId && message.visible_tiles) {
              // 如果收到地图更新但游戏还没开始，说明游戏已经在进行
              if (!gameStarted) {
                console.log("通过 map_update 设置游戏开始状态为 true");
                setGameStarted(true);
                setGameEnded(false);
              }

              // 更新地图数据（权威数据，覆盖乐观更新）
              const newMap: MapTile[] = (message.visible_tiles as any[]).map(
                (tileData: any) => {
                  const [x, y, type, count, userId, hasVision] = tileData;

                  // 解析城市类型
                  let tileType = type;
                  let cityType = undefined;

                  if (type.startsWith("c_")) {
                    tileType = "c";
                    cityType = type.substring(2); // 移除 "c_" 前缀
                    // 调试城市数据
                  }

                  return {
                    x,
                    y,
                    type: tileType,
                    count,
                    userId: userId || undefined,
                    cityType,
                    hasVision: hasVision ?? true, // 默认有视野
                  };
                }
              );

              // 立即更新地图，确保权威数据覆盖乐观更新
              setGameMap(newMap);

              // 记录已发现的城市类型 - 只有当前有视野的城市才记录
              setDiscoveredCities((prev) => {
                const newDiscovered = new Map(prev);
                newMap.forEach((tile) => {
                  // 只有当前确实有视野且是城市类型才记录
                  if (
                    tile.type === "c" &&
                    tile.hasVision === true &&
                    tile.cityType
                  ) {
                    const key = `${tile.x},${tile.y}`;
                    newDiscovered.set(key, tile.cityType);
                  }
                });
                return newDiscovered;
              });

              // 处理成功执行的移动 - 在轨迹失效检查之前处理
              if (
                message.successful_move_sends &&
                message.successful_move_sends.length > 0
              ) {
                console.log(
                  "收到成功执行的移动ID列表:",
                  message.successful_move_sends
                );

                setMoveTracks((prev) => {
                  let updatedTracks = [...prev];

                  // 对每个成功的移动ID，从轨迹中移除对应的移动
                  message.successful_move_sends!.forEach((successfulMoveId) => {
                    // 从第一个轨迹开始查找并移除
                    for (
                      let trackIndex = 0;
                      trackIndex < updatedTracks.length;
                      trackIndex++
                    ) {
                      const track = updatedTracks[trackIndex];
                      if (track && track.moves && track.moves.length > 0) {
                        const moveIndex = track.moves.findIndex(
                          (move) => move.move_id === successfulMoveId
                        );
                        if (moveIndex !== -1) {
                          // 找到了匹配的移动，移除它
                          const newMoves = [...track.moves];
                          newMoves.splice(moveIndex, 1);

                          updatedTracks[trackIndex] = {
                            ...track,
                            moves: newMoves,
                          };

                          console.log(
                            `移除成功执行的移动 ID ${successfulMoveId} 从轨迹 ${track.id}`
                          );
                          break; // 找到后跳出内层循环
                        }
                      }
                    }
                  });

                  // 移除空的轨迹
                  updatedTracks = updatedTracks.filter(
                    (track) => track && track.moves && track.moves.length > 0
                  );

                  // 更新ref以确保定时器能看到最新状态
                  moveTracksRef.current = updatedTracks;
                  return updatedTracks;
                });
              }

              // 检查当前轨迹的第一个移动是否仍然可执行
              setMoveTracks((prev) => {
                if (prev.length > 0) {
                  const currentTrack = prev[0];
                  if (
                    currentTrack &&
                    currentTrack.moves &&
                    currentTrack.moves.length > 0
                  ) {
                    const firstMove = currentTrack.moves[0];
                    const fromTile = newMap.find(
                      (tile) =>
                        tile.x === firstMove.from_x &&
                        tile.y === firstMove.from_y
                    );

                    if (
                      !fromTile ||
                      fromTile.userId !== playerTeam ||
                      fromTile.count <= 1
                    ) {
                      console.log("地图更新后，当前轨迹不可执行，删除整个轨迹");
                      const updatedTracks = prev.slice(1);
                      moveTracksRef.current = updatedTracks;

                      toaster.create({
                        title: "轨迹失效",
                        description: "地图更新后当前轨迹不可执行，已自动删除",
                        type: "warning",
                        duration: 2000,
                      });

                      return updatedTracks;
                    }
                  }
                }
                return prev;
              });

              // 更新玩家队伍信息（从 wsManager 获取，而不是推断）
              if (roomId) {
                const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
                if (
                  currentGroupId !== null &&
                  currentGroupId !== playerGroupId
                ) {
                  setPlayerGroupId(currentGroupId);
                  const teamInfo = getTeamInfo(currentGroupId);
                  setPlayerTeam(teamInfo.teamId);
                  console.log("更新玩家队伍信息:", {
                    groupId: currentGroupId,
                    teamInfo,
                  });
                }
              }
            }
            break;

          case "game_win":
            if (message.room_id == roomId) {
              setGameEnded(true);
              toaster.create({
                title: "游戏结束",
                description: `${message.winner} 获得胜利！`,
                type: "success",
              });
              setTimeout(() => {
                navigate(`/rooms/${roomId}`);
              }, 3000);
            }
            break;

          case "end_game":
            if (message.room_id == roomId) {
              setGameEnded(true);
              // 清空移动轨迹
              setMoveTracks([]);
              setSelectedTile(null);
              setIsConstructingTrack(false);
              toaster.create({
                title: "游戏结束",
                description: "游戏已结束，即将返回房间",
                type: "info",
              });
              // 2秒后返回房间页面
              setTimeout(() => {
                navigate(`/rooms/${roomId}`);
              }, 2000);
            }
            break;

          case "error":
            toaster.create({
              title: "错误",
              description: message.message || "发生未知错误",
              type: "error",
            });

            // 如果是移动相关的错误，可能需要清理已发送的移动
            // 目前的策略是等待下一次map_update来同步状态
            break;
        }
      }
    );

    return () => unsubscribeMessages();
  }, [roomId, navigate, gameStarted]);

  // 如果没有游戏开始，显示等待界面
  useEffect(() => {
    if (!gameStarted && !gameEnded) {
      // 如果页面直接访问而没有游戏开始，15秒后返回房间（给足够时间接收消息）
      const timeout = setTimeout(() => {
        if (!gameStarted && !gameEnded) {
          toaster.create({
            title: "游戏未开始",
            description: "长时间未收到游戏开始信号，返回房间",
            type: "warning",
          });
          navigate(`/rooms/${roomId}`);
        }
      }, 15000);

      return () => clearTimeout(timeout);
    }
  }, [gameStarted, gameEnded, roomId, navigate]);

  const handleBackToRoom = () => {
    navigate(`/rooms/${roomId}`);
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
    <Box w="100vw" h="100vh" bg="gray.50" overflow="hidden">
      {/* 顶部导航条 */}
      <Box
        w="full"
        h="60px"
        bg="white"
        borderBottom="1px solid"
        borderColor="gray.200"
        boxShadow="0 1px 3px rgba(0, 0, 0, 0.1)"
        px={6}
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        position="relative"
        zIndex={10}
      >
        <HStack gap={4}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToRoom}
            disabled={gameStarted && !gameEnded}
          >
            <LuArrowLeft />
            返回房间
          </Button>
          <Heading size="lg">房间 {roomId} - 游戏中</Heading>
        </HStack>

        {/* 右上角玩家兵力显示 - 简化显示条件 */}
        <PlayerPowerDisplay playerPowers={playerPowers} roomInfo={roomInfo} />
      </Box>

      {/* 游戏内容区域 - 全屏地图 */}
      <Box w="full" h="calc(100vh - 60px)" position="relative">
        {!gameStarted && !gameEnded && (
          <Box
            position="absolute"
            top="0"
            left="0"
            right="0"
            bottom="0"
            bg="rgba(255, 255, 255, 0.95)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={20}
          >
            <VStack gap={4}>
              <Spinner size="xl" colorPalette="blue" />
              <Text fontSize="xl" fontWeight="semibold">
                等待游戏开始...
              </Text>
              <Text fontSize="sm" color="gray.500">
                如果长时间等待，将自动返回房间
              </Text>
            </VStack>
          </Box>
        )}

        {gameStarted && !gameEnded && (
          <Box
            w="full"
            h="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {gameMap.length > 0 ? (
              <Box data-map-area position="relative">
                <Box
                  display="grid"
                  gridTemplateColumns="repeat(10, 1fr)"
                  gridTemplateRows="repeat(10, 1fr)"
                  gap={0}
                  width="600px"
                  height="600px"
                  border="none"
                  data-map-area
                  position="relative"
                >
                  {Array.from({ length: 100 }, (_, i) => {
                    const x = i % 10;
                    const y = Math.floor(i / 10);
                    const tile = gameMap.find((t) => t.x === x && t.y === y);

                    // 检查是否是void位置（硬编码的void位置）
                    const isVoidPosition =
                      (x === 0 && y === 0) ||
                      (x === 9 && y === 0) ||
                      (x === 0 && y === 9) ||
                      (x === 9 && y === 9);

                    if (isVoidPosition) {
                      // void位置渲染为完全透明，不占用空间，形成凹陷效果
                      return (
                        <Box
                          key={i}
                          bg="transparent"
                          border="none"
                          display="block" // 占用grid空间但不显示内容
                          cursor="default"
                          position="relative"
                        >
                          {/* 完全空白，形成凹陷效果 */}
                        </Box>
                      );
                    }

                    if (!tile) {
                      // 为非void的位置添加外边框
                      const borderStyles = {
                        borderTop:
                          y === 0 || isVoidPosition
                            ? "2px solid gray.600"
                            : "1px solid gray.400",
                        borderLeft:
                          x === 0 || isVoidPosition
                            ? "2px solid gray.600"
                            : "1px solid gray.400",
                        borderRight:
                          x === 9 ||
                          (x === 8 && y === 0) ||
                          (x === 8 && y === 9)
                            ? "2px solid gray.600"
                            : "1px solid gray.400",
                        borderBottom:
                          y === 9 ||
                          (y === 8 && x === 0) ||
                          (y === 8 && x === 9)
                            ? "2px solid gray.600"
                            : "1px solid gray.400",
                      };

                      return (
                        <Box
                          key={i}
                          bg="gray.500"
                          {...borderStyles}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          fontSize="xs"
                          color="gray.400"
                        ></Box>
                      );
                    }

                    // 计算边框样式，考虑void区域的影响
                    const isAtMapEdge = {
                      top: y === 0 || (y === 1 && (x === 0 || x === 9)), // 地图顶部或与void相邻
                      left: x === 0 || (x === 1 && (y === 0 || y === 9)), // 地图左侧或与void相邻
                      right: x === 9 || (x === 8 && (y === 0 || y === 9)), // 地图右侧或与void相邻
                      bottom: y === 9 || (y === 8 && (x === 0 || x === 9)), // 地图底部或与void相邻
                    };

                    const borderWidth = {
                      top: isAtMapEdge.top ? "2px" : "1px",
                      left: isAtMapEdge.left ? "2px" : "1px",
                      right: isAtMapEdge.right ? "2px" : "1px",
                      bottom: isAtMapEdge.bottom ? "2px" : "1px",
                    };

                    return (
                      <Box
                        key={i}
                        bg={getTileColor(tile)}
                        borderTop={`${borderWidth.top} solid`}
                        borderLeft={`${borderWidth.left} solid`}
                        borderRight={`${borderWidth.right} solid`}
                        borderBottom={`${borderWidth.bottom} solid`}
                        borderColor={
                          selectedTile &&
                          selectedTile.x === x &&
                          selectedTile.y === y
                            ? "gold"
                            : "gray.400"
                        }
                        boxShadow={
                          selectedTile &&
                          selectedTile.x === x &&
                          selectedTile.y === y
                            ? "inset 0 0 0 2px gold" // 内阴影高亮效果
                            : "none"
                        }
                        display={tile.type === "v" ? "none" : "flex"} // 占位符完全隐藏
                        alignItems="center"
                        justifyContent="center"
                        fontSize="lg"
                        fontWeight="bold"
                        cursor={
                          tile.type === "m" || tile.type === "v"
                            ? "not-allowed"
                            : "pointer"
                        }
                        position="relative"
                        _hover={
                          tile.type === "m" || tile.type === "v"
                            ? {} // 山和占位符不响应悬停
                            : {
                                bgColor: `${getTileColor(tile).split(".")[0]}.400`,
                                transition: "background-color 0.1s",
                              }
                        }
                        onClick={
                          tile.type === "m" || tile.type === "v"
                            ? undefined // 山和占位符不响应点击
                            : () => handleTileClick(x, y)
                        }
                        opacity={tile.type === "m" ? 1 : 1} // 移除山的透明度差异
                      >
                        {getTileText(tile)}
                      </Box>
                    );
                  })}
                </Box>

                {/* SVG箭头覆盖层 */}
                {moveTracks.length > 0 && (
                  <Box
                    position="absolute"
                    top="0"
                    left="0"
                    width="600px"
                    height="600px"
                    pointerEvents="none"
                    zIndex="10"
                  >
                    <svg
                      width="600"
                      height="600"
                      style={{ position: "absolute", top: 0, left: 0 }}
                    >
                      {/* 定义现代化箭头标记 */}
                      <defs>
                        <marker
                          id="arrowhead"
                          markerWidth="8"
                          markerHeight="8"
                          refX="7"
                          refY="4"
                          orient="auto"
                          markerUnits="strokeWidth"
                        >
                          <path
                            d="M0,0 L0,8 L8,4 z"
                            fill="currentColor"
                            stroke="none"
                          />
                        </marker>
                      </defs>
                      {renderMoveArrows()}
                    </svg>
                  </Box>
                )}
              </Box>
            ) : (
              <VStack py={10}>
                <Spinner />
                <Text>加载地图中...</Text>
              </VStack>
            )}
          </Box>
        )}

        {gameEnded && (
          <Box
            position="absolute"
            top="0"
            left="0"
            right="0"
            bottom="0"
            bg="rgba(255, 255, 255, 0.95)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={20}
          >
            <VStack gap={4}>
              <Text fontSize="3xl">🎉</Text>
              <Text fontSize="xl" fontWeight="semibold">
                游戏结束！
              </Text>
              <Text fontSize="sm" color="gray.500">
                即将返回房间...
              </Text>
              <Button mt={4} onClick={handleBackToRoom} colorPalette="blue">
                立即返回房间
              </Button>
            </VStack>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default GamePage;

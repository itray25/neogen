import React from "react";
import { Box, VStack, HStack, Text, Icon } from "@chakra-ui/react";
import { FaTrophy, FaUser, FaChartBar, FaCrown, FaMedal } from "react-icons/fa";
import { GiBattleGear, GiSwordman } from "react-icons/gi";

// 玩家兵力数据接口
interface PlayerPowerData {
  username: string;
  groupId: number;
  totalPower: number;
  status: "active" | "defeated" | "disconnected" | "offline";
}

// 组件属性接口
interface PlayerPowerRankingProps {
  playerPowers: PlayerPowerData[];
  roomInfo?: any; // 房间信息，包含玩家用户名等
  currentUsername?: string; // 当前玩家用户名
}

const PlayerPowerRanking: React.FC<PlayerPowerRankingProps> = ({
  playerPowers,
  roomInfo,
  currentUsername,
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

  // 只使用后端提供的真实数据，包括被击败和离线玩家
  const sortedPlayers = playerPowers.sort((a, b) => {
    // 首先按照状态排序：active > disconnected > defeated
    const statusOrder = { active: 3, disconnected: 2, offline: 1, defeated: 0 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[b.status] - statusOrder[a.status];
    }
    // 然后按兵力排序
    return b.totalPower - a.totalPower;
  });

  // 如果没有后端数据，显示等待状态
  if (sortedPlayers.length === 0) {
    return (
      <Box
        position="absolute"
        top="70px"
        right="20px"
        background="linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.95))"
        backdropFilter="blur(10px)"
        border="1px solid rgba(255, 255, 255, 0.3)"
        borderRadius="12px"
        p={4}
        minW="280px"
        boxShadow="0 8px 32px rgba(0, 0, 0, 0.12)"
        zIndex={15}
      >
        <VStack gap={3}>
          <HStack gap={2}>
            <Icon as={FaChartBar} color="blue.500" boxSize={5} />
            <Text
              fontSize="md"
              fontWeight="700"
              color="gray.700"
              letterSpacing="wide"
            >
              兵力排行榜
            </Text>
          </HStack>
          <Box textAlign="center" py={6}>
            <Icon as={GiBattleGear} color="gray.400" boxSize={8} mb={3} />
            <Text fontSize="sm" color="gray.500" fontWeight="500">
              等待战况数据载入...
            </Text>
          </Box>
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      position="absolute"
      top="70px"
      right="20px"
      background="rgba(255, 255, 255, 0.96)"
      border="2px solid rgba(0, 0, 0, 0.1)"
      borderRadius="6px"
      p={3}
      w="240px"
      boxShadow="0 4px 16px rgba(0, 0, 0, 0.15)"
      zIndex={15}
    >
      {/* 标题栏 - 紧凑设计 */}
      <HStack
        gap={2}
        w="full"
        justify="center"
        mb={2}
        pb={1}
        borderBottom="1px solid"
        borderColor="gray.200"
      >
        <Icon as={FaTrophy} color="orange.500" boxSize={3} />
        <Text fontSize="xs" fontWeight="700" color="gray.800">
          兵力榜
        </Text>
      </HStack>

      {/* 排行榜列表 - 紧凑方正设计 */}
      <VStack gap={1} align="stretch">
        {sortedPlayers.map((player, index) => {
          const teamInfo = getTeamInfo(player.groupId);
          const isFirstPlace = index === 0 && player.status === "active";
          const isSecondPlace = index === 1 && player.status === "active";
          const isThirdPlace = index === 2 && player.status === "active";
          const isCurrentPlayer = player.username === currentUsername; // 判断是否为当前玩家
          const teamColor = teamInfo?.color || "#999999";

          // 根据玩家状态调整显示
          const isDefeated = player.status === "defeated";
          const isDisconnected =
            player.status === "disconnected" || player.status === "offline";
          const displayColor = isDefeated
            ? "#888888"
            : isDisconnected
              ? "#CCCCCC"
              : teamColor;

          // 根据排名选择图标
          const getRankIcon = () => {
            if (isDefeated) return GiSwordman; // 被击败玩家显示剑
            if (isDisconnected) return FaUser; // 断线玩家显示用户图标
            if (isFirstPlace) return FaCrown;
            if (isSecondPlace || isThirdPlace) return FaMedal;
            return GiSwordman;
          };

          // 获取状态标识
          const getStatusLabel = () => {
            if (isDefeated) return "已败";
            if (player.status === "disconnected") return "断线";
            if (player.status === "offline") return "离线";
            return "";
          };

          return (
            <HStack
              key={`${player.groupId}-${player.username}`}
              gap={2}
              p={2}
              borderRadius="4px"
              border="2px solid"
              borderColor={displayColor}
              bg={
                isFirstPlace
                  ? `linear-gradient(135deg, ${displayColor}35, ${displayColor}20)`
                  : `linear-gradient(135deg, ${displayColor}25, ${displayColor}12)`
              }
              align="center"
              justify="space-between"
              boxShadow={`0 2px 8px ${displayColor}20`}
              _hover={{
                bg: isFirstPlace
                  ? `linear-gradient(135deg, ${displayColor}45, ${displayColor}25)`
                  : `linear-gradient(135deg, ${displayColor}35, ${displayColor}18)`,
              }}
              transition="all 0.2s ease"
              position="relative"
              overflow="hidden"
              opacity={isDefeated || isDisconnected ? 0.7 : 1}
            >
              {/* 左侧队伍颜色条 - 加宽 */}
              <Box
                position="absolute"
                left="0"
                top="0"
                bottom="0"
                w="6px"
                bg={displayColor}
                zIndex={2}
              />

              {/* 当前玩家左侧标识竖杠 */}
              {isCurrentPlayer && (
                <Box
                  position="absolute"
                  left="1px"
                  top="4px"
                  bottom="4px"
                  w="2px"
                  bg="linear-gradient(180deg, #ffffffff 0%, #ffffffff 100%)"
                  borderRadius="1px"
                  zIndex={3}
                  boxShadow="0 0 4px rgba(255, 255, 255, 0.6)"
                />
              )}

              {/* 背景渐变效果 */}
              <Box
                position="absolute"
                top="0"
                left="0"
                right="0"
                bottom="0"
                bg={`linear-gradient(45deg, transparent 0%, ${displayColor}12 50%, transparent 100%)`}
                zIndex={1}
              />
              {/* 排名区域 */}
              <HStack gap={2} flex="0 0 auto">
                <Box
                  w="20px"
                  h="20px"
                  borderRadius="3px"
                  bg={
                    isDefeated
                      ? "linear-gradient(135deg, #666666, #444444)"
                      : isDisconnected
                        ? "linear-gradient(135deg, #AAAAAA, #888888)"
                        : isFirstPlace
                          ? "linear-gradient(135deg, #FFD700, #FFA500)"
                          : isSecondPlace
                            ? "linear-gradient(135deg, #C0C0C0, #A0A0A0)"
                            : isThirdPlace
                              ? "linear-gradient(135deg, #CD7F32, #B8860B)"
                              : displayColor
                  }
                  color="white"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="xs"
                  fontWeight="bold"
                  flexShrink={0}
                >
                  {isDefeated || isDisconnected ? (
                    <Icon as={getRankIcon()} boxSize={2.5} ml="2px" />
                  ) : isFirstPlace || isSecondPlace || isThirdPlace ? (
                    <Icon as={getRankIcon()} boxSize={2.5} ml="2px" />
                  ) : (
                    index + 1
                  )}
                </Box>
              </HStack>

              {/* 玩家信息区域 */}
              <VStack gap={0} align="start" flex={1} minW={0}>
                <HStack gap={1} align="center">
                  <Text
                    fontSize="xs"
                    fontWeight="600"
                    color={
                      isDefeated || isDisconnected ? "gray.500" : "gray.800"
                    }
                    lineHeight="1.2"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    maxW="80px"
                    textDecoration={isDefeated ? "line-through" : "none"}
                  >
                    {player.username}
                  </Text>
                  {isCurrentPlayer && (
                    <Text fontSize="10px" color="blue.600" fontWeight="bold">
                      (我)
                    </Text>
                  )}
                  {getStatusLabel() && (
                    <Text
                      fontSize="9px"
                      color={isDefeated ? "red.500" : "orange.500"}
                      fontWeight="bold"
                      bg={isDefeated ? "red.100" : "orange.100"}
                      px={1}
                      borderRadius="2px"
                    >
                      {getStatusLabel()}
                    </Text>
                  )}
                </HStack>
                <HStack gap={1} align="center">
                  <Box
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg={displayColor}
                    flexShrink={0}
                  />
                  <Text
                    fontSize="10px"
                    color={
                      isDefeated || isDisconnected ? "gray.400" : "gray.500"
                    }
                    lineHeight="1"
                    fontWeight="500"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    maxW="60px"
                  >
                    {teamInfo?.name || `队${player.groupId}`}
                  </Text>
                </HStack>
              </VStack>

              {/* 兵力数值区域 */}
              <HStack gap={1} align="center" flex="0 0 auto">
                <Icon
                  as={GiBattleGear}
                  boxSize={4}
                  color={isDefeated || isDisconnected ? "gray.400" : "gray.600"}
                />
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  color={
                    isDefeated
                      ? "red.400"
                      : isDisconnected
                        ? "gray.400"
                        : isFirstPlace
                          ? "yellow.600"
                          : "gray.700"
                  }
                  minW="30px"
                  textAlign="right"
                >
                  {player.totalPower}
                </Text>
              </HStack>
            </HStack>
          );
        })}
      </VStack>

      {/* 底部说明 - 紧凑版 */}
      <HStack
        gap={1}
        justify="center"
        mt={2}
        pt={1}
        borderTop="1px solid"
        borderColor="gray.200"
      >
        <Icon as={FaChartBar} color="blue.500" boxSize={2.5} />
        <Text fontSize="10px" color="gray.500" fontWeight="500">
          全局信息
        </Text>
      </HStack>
    </Box>
  );
};

export default PlayerPowerRanking;
export type { PlayerPowerData, PlayerPowerRankingProps };

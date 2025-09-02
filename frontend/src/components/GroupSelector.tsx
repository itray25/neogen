import React from "react";
import {
  Box,
  Button,
  Text,
  Flex,
  Grid,
  Badge,
  VStack,
  GridItem,
} from "@chakra-ui/react";
import { GroupInfo } from "../hooks/wsManager";

interface GroupSelectorProps {
  groups: GroupInfo[];
  currentGroupId: number | null;
  onGroupChange: (groupId: number) => void;
  disabled?: boolean;
}

// 组名称和颜色映射
const getGroupInfo = (id: number) => {
  const groupMap = {
    0: { name: "红队", color: "#D46A6A" }, // 更加温暖的红，减少灰色调
    1: { name: "蓝队", color: "#6B8EC6" }, // 更明亮的蓝色，减少灰色
    2: { name: "绿队", color: "#5D9B7E" }, // 更清新的绿色
    3: { name: "黄队", color: "#D4B668" }, // 更明亮的黄色
    4: { name: "紫队", color: "#8A7CC2" }, // 更鲜艳的紫色
    5: { name: "青队", color: "#5BA4A2" }, // 更清晰的水青色
    6: { name: "橙队", color: "#D49A6A" }, // 更温暖的橙色
    7: { name: "粉队", color: "#D490A5" }, // 更粉嫩的颜色
    8: { name: "观众", color: "#9E9E9E" }, // 稍微深一点的灰色，增加可读性
  };
  return (
    groupMap[id as keyof typeof groupMap] || { name: "未知", color: "#000000" }
  );
};

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groups,
  currentGroupId,
  onGroupChange,
  disabled = false,
}) => {
  return (
    <VStack align="stretch" gap={3}>
      <Text fontSize="lg" fontWeight="bold" color="gray.700">
        选择组别
      </Text>

      <Grid templateColumns="repeat(3, 1fr)" gap={3}>
        {groups.map((group) => {
          const groupInfo = getGroupInfo(Number(group.id));
          const isCurrentGroup = Number(group.id) === Number(currentGroupId);
          const isObserverGroup = Number(group.id) === 8;

          return (
            <GridItem key={group.id}>
              <Button
                onClick={() => {
                  if (!isCurrentGroup) onGroupChange(Number(group.id));
                }}
                disabled={disabled}
                variant={isCurrentGroup ? "solid" : "outline"}
                colorScheme={isCurrentGroup ? "blue" : "gray"}
                size="sm"
                width="100%"
                height="60px"
                backgroundColor={
                  isCurrentGroup ? groupInfo.color : "transparent"
                }
                borderColor={groupInfo.color}
                borderWidth="2px"
                color={isCurrentGroup ? "white" : "gray.700"}
                _hover={{
                  backgroundColor: isCurrentGroup
                    ? groupInfo.color
                    : `${groupInfo.color}20`,
                  transform: "scale(1.02)",
                }}
                _active={{
                  transform: "scale(0.98)",
                }}
                position="relative"
              >
                <VStack gap={1}>
                  <Text fontSize="xs" fontWeight="bold">
                    {groupInfo.name}
                  </Text>
                  <Badge
                    size="xs"
                    variant="solid"
                    backgroundColor={
                      isCurrentGroup ? "whiteAlpha.300" : groupInfo.color
                    }
                    color={isCurrentGroup ? "white" : "white"}
                  >
                    {group.players.length}人
                  </Badge>
                </VStack>
              </Button>
            </GridItem>
          );
        })}
      </Grid>

      <VStack align="stretch" gap={2} mt={4}>
        <Text fontSize="sm" fontWeight="semibold" color="gray.600">
          组员列表
        </Text>
        {groups.map((group) => {
          if (group.players.length === 0) return null;
          const groupInfo = getGroupInfo(group.id);

          return (
            <Box
              key={group.id}
              p={2}
              borderRadius="md"
              backgroundColor="gray.50"
            >
              <Flex align="center" mb={1}>
                <Box
                  width="12px"
                  height="12px"
                  borderRadius="2px"
                  backgroundColor={groupInfo.color}
                  mr={2}
                />
                <Text fontSize="sm" fontWeight="medium">
                  {groupInfo.name}
                </Text>
              </Flex>
              <Flex wrap="wrap" gap={1}>
                {group.players.map((playerName, index) => (
                  <Badge
                    key={index}
                    size="sm"
                    variant="subtle"
                    colorScheme={group.id === 8 ? "gray" : "blue"}
                  >
                    {playerName}
                  </Badge>
                ))}
              </Flex>
            </Box>
          );
        })}
      </VStack>
    </VStack>
  );
};

export default GroupSelector;

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
    0: { name: "红队", color: "#9E4B56" },
    1: { name: "蓝队", color: "#556C8B" },
    2: { name: "绿队", color: "#4D7966" },
    3: { name: "黄队", color: "#B89B59" },
    4: { name: "紫队", color: "#655A7F" },
    5: { name: "青队", color: "	#3F7876" },
    6: { name: "橙队", color: "#B37D5C" },
    7: { name: "粉队", color: "#B87B8B" },
    8: { name: "观众", color: "#888888" },
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
                onClick={() => onGroupChange(group.id)}
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

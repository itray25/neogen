import React from "react";
import { Box, Heading, VStack, HStack } from "@chakra-ui/react";
import { RoomGrid } from "../components/RoomGrid";
import { MainButtons } from "../components/MainButtons";

const Room = () => {
  return (
    <Box p={6} maxW="1200px" mx="auto">
      <VStack align="stretch" gap={6}>
        {/* 页面标题和操作按钮 */}
        <HStack justify="space-between" align="center">
          <Heading size="lg">游戏房间</Heading>
          <MainButtons />
        </HStack>

        {/* 房间列表 */}
        <RoomGrid />
      </VStack>
    </Box>
  );
};

export default Room;

import React from "react";
import { VStack, Button, HStack, Text } from "@chakra-ui/react";
import { LuGamepad2, LuDoorOpen, LuMap } from "react-icons/lu";

export const MainButtons: React.FC = () => {
  return (
    <VStack gap={6} w="100%" maxW="400px">
      <Text fontSize="2xl" fontWeight="bold" color="gray.700" mb={4}>
        游戏菜单
      </Text>

      <VStack gap={4} w="100%">
        <Button
          size="lg"
          colorPalette="purple"
          w="100%"
          minH="60px"
          onClick={() => {
            // TODO: 实现匹配游戏逻辑
            console.log("匹配游戏");
          }}
        >
          <LuGamepad2 size={20} />
          匹配游戏
        </Button>

        <Button
          size="lg"
          colorPalette="blue"
          w="100%"
          minH="60px"
          onClick={() => {
            // TODO: 实现加入房间逻辑
            console.log("加入房间");
          }}
        >
          <LuDoorOpen size={20} />
          加入房间
        </Button>

        <Button
          size="lg"
          colorPalette="green"
          w="100%"
          minH="60px"
          onClick={() => {
            // TODO: 实现新建地图逻辑
            console.log("新建地图");
          }}
        >
          <LuMap size={20} />
          新建地图
        </Button>
      </VStack>
    </VStack>
  );
};

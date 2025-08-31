import React from "react";
import {
  VStack,
  Button,
  HStack,
  Text,
  Portal,
  Dialog,
  CloseButton,
  SegmentGroup,
} from "@chakra-ui/react";
import { LuGamepad2, LuDoorOpen, LuMap } from "react-icons/lu";
import { RoomGrid } from "./RoomGrid";
import { CreateRoomForm } from "./CreateRoomForm";
import { useNavigate } from "react-router-dom";
export const MainButtons: React.FC = () => {
  const [value, setValue] = React.useState<string | null>("加入房间");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedColor, setSelectedColor] = React.useState("#4F46E5"); // 添加颜色状态
  const navigate = useNavigate();

  const handleRoomCreated = (roomId: string) => {
    console.log(`房间创建成功，ID: ${roomId}`);
    setIsDialogOpen(false);
    navigate(`/rooms/${roomId}`);
  };

  const renderDialogContent = () => {
    if (value === "加入房间") {
      return <RoomGrid />;
    } else if (value === "创建房间") {
      return (
        <CreateRoomForm
          onRoomCreated={handleRoomCreated}
          onCancel={() => setIsDialogOpen(false)}
          colorSelected={selectedColor}
          onColorChange={setSelectedColor} // 添加颜色变化回调
        />
      );
    }
    return null;
  };
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
        <Dialog.Root motionPreset="slide-in-bottom">
          <Dialog.Trigger asChild>
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
          </Dialog.Trigger>
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content
                maxW="4xl"
                w="90vw"
                maxH="80vh"
                border="3px solid"
                borderColor={value === "创建房间" ? selectedColor : "gray.200"}
                transition="border-color 0.2s ease"
              >
                <Dialog.Header borderBottom={1} borderColor="gray.200" mb={4}>
                  <SegmentGroup.Root
                    value={value}
                    onValueChange={(e: {
                      value: React.SetStateAction<string | null>;
                    }) => {
                      setValue(e.value);
                      // 当切换到"创建房间"时，重置为默认颜色
                      if (e.value === "创建房间") {
                        setSelectedColor("#4F46E5");
                      }
                    }}
                  >
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Items items={["加入房间", "创建房间"]} />
                  </SegmentGroup.Root>
                </Dialog.Header>
                <Dialog.Body overflowY="auto" maxH="60vh">
                  {renderDialogContent()}
                </Dialog.Body>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>

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

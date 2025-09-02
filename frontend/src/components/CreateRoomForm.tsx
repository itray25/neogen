import React, { useState, FormEvent } from "react";
import {
  Stack,
  Input,
  Button,
  Text,
  Box,
  Slider,
  Switch,
  IconButton,
  Field,
  ColorPicker,
  Portal,
  HStack,
  parseColor,
} from "@chakra-ui/react";
import { PasswordInput } from "@/components/ui/password-input";
import { LuPlus, LuUsers, LuPalette, LuSettings2 } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl, API_ENDPOINTS } from "../config/api";

interface CreateRoomFormProps {
  onRoomCreated: (roomId: string) => void;
  onCancel: () => void;
  colorSelected?: string;
  onColorChange?: (color: string) => void; // 添加颜色变化回调
}

interface CreateRoomRequest {
  room_id?: string;
  name: string;
  max_players: number;
  room_color: string;
  host_id: string;
  host_name: string;
  password?: string;
  is_public: boolean;
}

interface CreateRoomResponse {
  room_id: string;
  name: string;
  max_players: number;
  room_color: string;
  host_id: string;
  host_name: string;
  status: string;
  message: string;
}

export const CreateRoomForm: React.FC<CreateRoomFormProps> = ({
  onRoomCreated,
  onCancel,
  colorSelected,
  onColorChange,
}) => {
  const { user } = useAuth();
  const [customRoomId, setCustomRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [roomColor, setRoomColor] = useState(colorSelected || "#4F46E5");
  const [password, setPassword] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const marks = [
    { value: 2, label: "2" },
    { value: 8, label: "8" },
    { value: 16, label: "16" },
  ];
  const swatches = [
    "#000000",
    "#4A5568",
    "#F56565",
    "#ED64A6",
    "#9F7AEA",
    "#6B46C1",
    "#4299E1",
    "#0BC5EA",
    "#00B5D8",
    "#38B2AC",
    "#48BB78",
    "#68D391",
    "#ECC94B",
    "#DD6B20",
  ];
  // 处理颜色变化
  const handleColorChange = (color: string) => {
    setRoomColor(color);
    onColorChange?.(color); // 通知父组件颜色变化
  };

  // 将rgba颜色转换为hex格式
  const convertRgbaToHex = (rgba: string): string => {
    // 如果已经是hex格式，直接返回
    if (rgba.startsWith("#")) {
      return rgba;
    }

    // 解析rgba格式
    const rgbaMatch = rgba.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/
    );
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1]);
      const g = parseInt(rgbaMatch[2]);
      const b = parseInt(rgbaMatch[3]);

      const toHex = (n: number) => {
        const hex = n.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    return rgba; // 如果解析失败，返回原值
  };

  // 处理ColorPicker的颜色变化
  const handleColorPickerChange = (details: any) => {
    const hexColor = convertRgbaToHex(details.valueAsString);
    handleColorChange(hexColor);
  };
  const predefinedColors = [
    "#4F46E5", // Indigo
    "#EF4444", // Red
    "#10B981", // Green
    "#F59E0B", // Yellow
    "#8B5CF6", // Purple
    "#06B6D4", // Cyan
    "#F97316", // Orange
    "#EC4899", // Pink
  ];

  const validateRoomId = (roomId: string): string | null => {
    if (!roomId) return null;
    if (roomId.length > 10) return "房间ID不能超过10个字符";
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9]+$/;
    if (!validPattern.test(roomId)) return "房间ID只能包含中文、英文字母和数字";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!roomName.trim()) {
      setError("请输入房间名称");
      return;
    }
    if (roomName.length > 50) {
      setError("房间名称不能超过50个字符");
      return;
    }
    if (customRoomId.trim()) {
      const roomIdError = validateRoomId(customRoomId.trim());
      if (roomIdError) {
        setError(roomIdError);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const request: CreateRoomRequest = {
        host_id: user?.user_id || "abc",
        host_name: user?.username || "Unknown",
        name: roomName.trim(),
        max_players: maxPlayers,
        room_color: roomColor,
        is_public: isPublic,
      };

      if (customRoomId.trim()) request.room_id = customRoomId.trim();
      if (password.trim()) request.password = password.trim();

      const response = await fetch(buildApiUrl(API_ENDPOINTS.CREATE_ROOM), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (response.ok) {
        onRoomCreated((data as CreateRoomResponse).room_id);
      } else {
        setError(data.message || "创建房间失败");
      }
    } catch (err) {
      setError("网络错误，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack
      as="form"
      onSubmit={handleSubmit}
      direction="column"
      gap="5"
      align="stretch"
    >
      <Field.Root>
        <Field.Label>房间名称</Field.Label>
        <Input
          placeholder="例如：萌新求带"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          maxLength={50}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>自定义房间ID (可选)</Field.Label>
        <Input
          placeholder="最多10个字符，仅限中文、字母、数字"
          value={customRoomId}
          onChange={(e) => setCustomRoomId(e.target.value)}
          maxLength={10}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>房间密码 (可选)</Field.Label>
        <PasswordInput
          placeholder="留空则为无密码房间"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={20}
        />
      </Field.Root>

      <Field.Root>
        <Stack direction="row" align="center" justify="space-between">
          <Field.Label mb="0">
            公开房间 ({isPublic ? "可见" : "不可见"})
          </Field.Label>
          <Switch.Root
            id="is-public"
            checked={isPublic}
            onCheckedChange={(details: {
              checked: boolean | ((prevState: boolean) => boolean);
            }) => setIsPublic(details.checked)}
            colorPalette="blue"
          >
            <Switch.HiddenInput />
            <Switch.Control />
          </Switch.Root>
        </Stack>
      </Field.Root>

      <Box>
        <Text fontSize="sm" fontWeight="medium" mb="3">
          最大玩家数: {maxPlayers}
        </Text>
        <Box maxW="300px">
          <Slider.Root
            defaultValue={[8]}
            min={2}
            max={16}
            step={1}
            onValueChange={(details: {
              value: React.SetStateAction<number>[];
            }) => setMaxPlayers(details.value[0])}
            colorPalette={"blue"}
          >
            <Slider.Control>
              <Slider.Track>
                <Slider.Range />
              </Slider.Track>
              <Slider.Thumb
                index={0}
                aria-label="Max Players"
                boxSize={5}
                borderColor="blue.200"
                shadow="md"
                _hover={{ transform: "scale(1.1)" }}
              >
                <Box as={LuUsers} fontSize="sm" />
              </Slider.Thumb>
              <Slider.Marks marks={marks} />
            </Slider.Control>
          </Slider.Root>
        </Box>
      </Box>
      <Field.Root>
        <Field.Label>房间颜色</Field.Label>
        <Stack direction="row" gap="3" align="center">
          {predefinedColors.map((color) => (
            <IconButton
              key={color}
              aria-label={`color ${color}`}
              size="sm"
              bg={color}
              onClick={() => handleColorChange(color)}
              border={roomColor === color ? "3px solid" : "1px solid"}
              borderColor={roomColor === color ? "blue.500" : "gray.200"}
              _hover={{ transform: "scale(1.1)" }}
            >
              <LuPalette />
            </IconButton>
          ))}
          <ColorPicker.Root
            defaultValue={parseColor(roomColor)}
            maxW="200px"
            onValueChange={handleColorPickerChange}
          >
            <ColorPicker.HiddenInput />
            <ColorPicker.Control>
              <ColorPicker.Trigger asChild>
                <IconButton
                  size="sm"
                  bg="gray.500"
                  border="1px solid"
                  borderColor="gray.100"
                  aria-label="自定义颜色"
                  _hover={{ transform: "scale(1.1)", bg: "gray.600" }}
                >
                  <LuSettings2 />
                </IconButton>
              </ColorPicker.Trigger>
            </ColorPicker.Control>
            <Portal>
              <ColorPicker.Positioner style={{ zIndex: 9999 }}>
                <ColorPicker.Content
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  shadow="lg"
                  p="4"
                >
                  <ColorPicker.Area />
                  <HStack mt="3">
                    <ColorPicker.EyeDropper size="xs" variant="outline" />
                    <ColorPicker.Sliders />
                  </HStack>
                </ColorPicker.Content>
              </ColorPicker.Positioner>
            </Portal>
          </ColorPicker.Root>
        </Stack>
      </Field.Root>
      {error && (
        <Text color="red.500" textAlign="center">
          {error}
        </Text>
      )}

      <Stack direction="row" justify="flex-end" w="100%" gap="3">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          取消
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          bg={roomColor}
          color="white"
          _hover={{ bg: roomColor, opacity: 0.8 }}
          _active={{ bg: roomColor, opacity: 0.9 }}
        >
          <Stack direction="row" align="center" gap="2">
            <LuPlus />
            <Text>{isSubmitting ? "创建中..." : "创建房间"}</Text>
          </Stack>
        </Button>
      </Stack>
    </Stack>
  );
};

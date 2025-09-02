import React, { useState, useEffect } from "react";
import { Button, Text, VStack, Badge, HStack } from "@chakra-ui/react";

interface ForceStartButtonProps {
  isForceStarted: boolean;
  forceStartCount: number;
  requiredToStart: number;
  onForceStart: () => void;
  onCancelForceStart: () => void;
  disabled?: boolean;
}

export const ForceStartButton: React.FC<ForceStartButtonProps> = ({
  isForceStarted,
  forceStartCount,
  requiredToStart,
  onForceStart,
  onCancelForceStart,
  disabled = false,
}) => {
  const [animationProgress, setAnimationProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationKey, setAnimationKey] = useState(0); // 用于强制重新触发动画
  const isReady = forceStartCount >= requiredToStart;

  // 计算基础进度
  const baseProgress = Math.min((forceStartCount / requiredToStart) * 100, 100);

  // 当达到100%时，触发动画效果
  useEffect(() => {
    if (isReady && !isAnimating) {
      setIsAnimating(true);
      setAnimationProgress(100);

      // 1秒后开始退回动画
      const timeout = setTimeout(() => {
        setAnimationProgress(0);
        // 动画完成后重置状态，并增加key以允许再次触发
        setTimeout(() => {
          setIsAnimating(false);
          setAnimationKey((prev) => prev + 1);
        }, 500);
      }, 1000);

      return () => clearTimeout(timeout);
    } else if (!isReady) {
      setIsAnimating(false);
      setAnimationProgress(0);
    }
  }, [isReady, animationKey]); // 添加animationKey作为依赖

  // 显示的进度值
  const displayProgress = isAnimating ? animationProgress : baseProgress;

  return (
    <VStack align="stretch" gap={3}>
      <HStack justify="space-between" align="center">
        <Text fontSize="md" fontWeight="semibold" color="gray.700">
          强制开始
        </Text>
        <Badge
          size="sm"
          colorPalette={isReady ? "green" : "orange"}
          variant="solid"
        >
          {forceStartCount}/{requiredToStart}
        </Badge>
      </HStack>

      {/* 进度条 */}
      <div
        style={{
          width: "100%",
          height: "8px",
          backgroundColor: "#E2E8F0",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${displayProgress}%`,
            height: "100%",
            backgroundColor: isReady ? "#48BB78" : "#ED8936",
            transition: isAnimating
              ? "width 0.5s ease-in-out"
              : "width 0.3s ease",
          }}
        />
      </div>

      {/* 按钮 */}
      <Button
        onClick={isForceStarted ? onCancelForceStart : onForceStart}
        disabled={disabled}
        colorPalette={isForceStarted ? "red" : "green"}
        variant={isForceStarted ? "outline" : "solid"}
        size="md"
        width="100%"
      >
        {isForceStarted ? "取消准备" : "准备开始"}
      </Button>

      {/* 状态提示 */}
      <Text fontSize="xs" color="gray.500" textAlign="center">
        {isReady
          ? isAnimating
            ? "游戏即将开始..."
            : "已达到开始人数，游戏即将开始！"
          : `还需要 ${requiredToStart - forceStartCount} 人准备`}
      </Text>
    </VStack>
  );
};

export default ForceStartButton;

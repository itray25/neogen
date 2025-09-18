import React, { useState } from "react";
import { VStack, Input, Field, Button, InputGroup } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { toaster } from "@/components/ui/toaster";
import { LuText, LuTerminal } from "react-icons/lu";
import { buildApiUrl, API_ENDPOINTS } from "../config/api";
interface LoginUserData {
  user_id: string;
}

interface LoginFormProps {
  onSubmit?: (data: LoginUserData) => void;
  onLoginSuccess?: (user: any) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  onLoginSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginUserData>();

  const handleLogin = async (data: LoginUserData) => {
    setIsLoading(true);

    try {
      // 输入验证 - 改为字符串验证
      const userId = data.user_id.trim();
      if (!userId) {
        toaster.create({
          title: "验证错误",
          description: "User ID 不能为空",
          type: "error",
        });
        setIsLoading(false);
        return;
      }

      if (userId.length > 8) {
        toaster.create({
          title: "验证错误",
          description: "User ID 不能超过8个字符",
          type: "error",
        });
        setIsLoading(false);
        return;
      }

      // 调用登录 API - 直接使用字符串
      const response = await fetch(
        buildApiUrl(API_ENDPOINTS.USERS, { user_id: userId }),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const user = await response.json();
        console.log("登录成功:", user);

        // 调用成功回调
        if (onLoginSuccess) {
          onLoginSuccess(user);
        }
        if (onSubmit) {
          onSubmit(data);
        }
      } else if (response.status === 404) {
        toaster.create({
          title: "登录失败",
          description: "用户不存在，请检查 User ID 或先进行注册",
          type: "warning",
        });
      } else {
        const errorText = await response.text();
        toaster.create({
          title: "登录失败",
          description: `登录失败: ${errorText}`,
          type: "error",
        });
      }
    } catch (error) {
      console.error("登录错误:", error);
      toaster.create({
        title: "系统错误",
        description:
          error instanceof Error ? error.message : "登录时发生未知错误",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleLogin)}>
      <VStack>
        <Field.Root required>
          <Field.Label>
            user_id <Field.RequiredIndicator />
          </Field.Label>
          <InputGroup startAddon={<LuText />}>
            <Input placeholder="请输入您的 User ID" {...register("user_id")} />
          </InputGroup>
          <Field.HelperText>账号注册时设置的 User ID</Field.HelperText>
        </Field.Root>
        <Button
          type="submit"
          loading={isLoading}
          colorPalette="teal"
          w="100%"
          minW="300px"
        >
          <LuTerminal />
          {isLoading ? "登录中..." : "开始游戏！"}
        </Button>
      </VStack>
    </form>
  );
};

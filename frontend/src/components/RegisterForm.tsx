import React, { useState } from "react";
import {
  VStack,
  Input,
  Field,
  Button,
  Text,
  InputGroup,
} from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { toaster } from "@/components/ui/toaster";
import { LuText, LuCircleUser, LuTerminal } from "react-icons/lu";
import { validateUsername } from "../utils/usernameValidator";
interface RegisterUserData {
  user_id: string;
  username: string;
}

interface RegisterFormProps {
  onSubmit?: (data: RegisterUserData) => void;
  onRegisterSuccess?: (user: any) => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSubmit,
  onRegisterSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterUserData>();

  const randomUserId = Array.from({ length: 6 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(
      Math.floor(Math.random() * 62)
    )
  ).join("");

  const handleRegister = async (data: RegisterUserData) => {
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

      // 用户名验证
      const usernameValidation = validateUsername(data.username);
      if (!usernameValidation.isValid) {
        toaster.create({
          title: "验证错误",
          description: usernameValidation.error || "用户名格式不正确",
          type: "error",
        });
        setIsLoading(false);
        return;
      }

      // 直接注册，让后端处理重复检查
      const registerResponse = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId, // 改为字符串字段
          username: data.username.trim(),
        }),
      });

      if (registerResponse.ok) {
        const newUser = await registerResponse.json();
        console.log("注册成功:", newUser);

        // 调用成功回调
        if (onRegisterSuccess) {
          onRegisterSuccess(newUser);
        }
        if (onSubmit) {
          onSubmit(data);
        }
      } else if (registerResponse.status === 409) {
        // 冲突错误（用户ID或用户名重复）
        try {
          const errorData = await registerResponse.json();
          toaster.create({
            title: "注册失败",
            description: errorData.message || "用户ID或用户名已存在",
            type: "warning",
          });
        } catch {
          toaster.create({
            title: "注册失败",
            description: "用户ID或用户名已存在",
            type: "warning",
          });
        }
      } else if (registerResponse.status === 400) {
        // 验证错误（包含禁用内容等）
        try {
          const errorData = await registerResponse.json();
          toaster.create({
            title: "注册失败",
            description: errorData.message || "输入数据不符合要求",
            type: "error",
          });
        } catch {
          toaster.create({
            title: "注册失败",
            description: "输入数据不符合要求",
            type: "error",
          });
        }
      } else {
        // 其他错误
        try {
          const errorData = await registerResponse.json();
          toaster.create({
            title: "注册失败",
            description: errorData.message || "注册时发生未知错误",
            type: "error",
          });
        } catch {
          const errorText = await registerResponse.text();
          toaster.create({
            title: "注册失败",
            description: `注册失败: ${errorText}`,
            type: "error",
          });
        }
      }
    } catch (error) {
      console.error("注册错误:", error);
      toaster.create({
        title: "系统错误",
        description:
          error instanceof Error ? error.message : "注册时发生未知错误",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleRegister)}>
      <VStack>
        <Field.Root required>
          <Field.Label>
            user_id <Field.RequiredIndicator />
          </Field.Label>
          <InputGroup startAddon={<LuText />}>
            <Input placeholder={randomUserId} {...register("user_id")} />
          </InputGroup>
          <Field.HelperText>登录账号用，不要告诉其他人qwq</Field.HelperText>
        </Field.Root>
        <Field.Root required>
          <Field.Label>
            用户名 <Field.RequiredIndicator />
          </Field.Label>
          <InputGroup startAddon={<LuCircleUser />}>
            <Input
              placeholder={"User#" + randomUserId}
              {...register("username")}
            />
          </InputGroup>
          <Field.HelperText>游戏内显示的名称</Field.HelperText>
        </Field.Root>
        <Button
          type="submit"
          loading={isLoading}
          colorPalette="teal"
          w="100%"
          minW="300px"
        >
          <LuTerminal />
          {isLoading ? "注册中..." : "开始游戏！"}
        </Button>
      </VStack>
    </form>
  );
};

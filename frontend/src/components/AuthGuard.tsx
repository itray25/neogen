import React from "react";
import { useNavigate } from "react-router-dom";
import { Center, Text, VStack } from "@chakra-ui/react";
import { useAuth } from "../contexts/AuthContext";
import { toaster } from "@/components/ui/toaster";

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toaster.create({
        title: "未登录",
        description: "请先注册或登录后再访问该页面",
        type: "warning",
      });
      navigate("/");
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <Center h="100vh">
        <VStack gap={4}>
          <Text fontSize="lg">验证登录状态中...</Text>
        </VStack>
      </Center>
    );
  }

  if (!isAuthenticated) {
    return (
      <Center h="100vh">
        <VStack gap={4}>
          <Text fontSize="lg" color="red.500">
            未授权访问，正在跳转到首页...
          </Text>
        </VStack>
      </Center>
    );
  }

  return <>{children}</>;
};

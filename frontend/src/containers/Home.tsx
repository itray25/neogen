import React from "react";
import { Center, VStack, Text, HStack, Link, Box } from "@chakra-ui/react";
import { AuthForms } from "../components/AuthForms";
import { MainButtons } from "../components/MainButtons";
import { useAuth } from "../contexts/AuthContext";

export const Home = () => {
  const { user, isLoading, isAuthenticated, login } = useAuth();

  const handleRegisterSuccess = (userData: any) => {
    console.log("注册成功，用户信息:", userData);
    // 通过Context登录，无需手动管理localStorage
    login({
      user_id: userData.id,
      username: userData.username,
    });
  };

  const handleLoginSuccess = (userData: any) => {
    console.log("登录成功，用户信息:", userData);
    // 通过Context登录，无需手动管理localStorage
    login({
      user_id: userData.id,
      username: userData.username,
    });
  };

  return (
    <VStack gap={8} p={6}>
      <Center w="100%" h="30vh">
        <Box
          pl={3}
          pr={3}
          pb={2}
          borderRadius="2xl"
          boxShadow="lg"
          bg="white"
          transition="all 0.3s"
          _hover={{
            transform: "translateY(-5px)",
            boxShadow: "xl",
          }}
        >
          <Text fontSize="6xl" letterSpacing="tight">
            <Text
              as="span"
              bgGradient="to-r"
              gradientFrom="purple.500"
              gradientTo="pink.500"
              bgClip="text"
            >
              Next
            </Text>
            <Text as="span" color="gray.300" fontWeight="medium">
              [
            </Text>
            <Text as="span" color="rgba(84, 186, 186, 1)" fontWeight="500">
              Gen
            </Text>
            <Text as="span" color="gray.300" fontWeight="medium">
              ]
            </Text>
          </Text>
        </Box>
      </Center>
      <VStack>
        {isLoading ? (
          <Text>加载中...</Text>
        ) : isAuthenticated ? (
          <>
            <Text fontSize="xl" fontWeight="bold" color="green.600" mb={4}>
              欢迎回来，{user?.username}！
            </Text>
            <MainButtons />
          </>
        ) : (
          <AuthForms
            onRegisterSuccess={handleRegisterSuccess}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
      </VStack>
      <Text fontSize="lg" color="gray.600" textAlign="center">
        编辑{" "}
        <Text as="code" bg="gray.100" px={2} py={1} borderRadius="md">
          frontend/src/App.tsx
        </Text>{" "}
        并保存以重新加载。
      </Text>

      <HStack gap={4}>
        <Link
          href="https://create-rust-app.dev"
          target="_blank"
          rel="noopener noreferrer"
          color="blue.500"
          fontWeight="medium"
          _hover={{ color: "blue.600", textDecoration: "underline" }}
        >
          文档
        </Link>
        <Link
          href="https://github.com/Wulf/create-rust-app"
          target="_blank"
          rel="noopener noreferrer"
          color="blue.500"
          fontWeight="medium"
          _hover={{ color: "blue.600", textDecoration: "underline" }}
        >
          仓库
        </Link>
      </HStack>
    </VStack>
  );
};

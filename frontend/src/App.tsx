import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Box, HStack, Text, Button } from "@chakra-ui/react";
import { Toaster } from "@/components/ui/toaster";
import { Home } from "./containers/Home";
import Room from "./containers/Room";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthGuard } from "./components/AuthGuard";
import "./App.css";

const AppContent = () => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <Box>
      {/* 导航栏 */}
      <Box borderBottomWidth={1} p={4} bg="gray.50">
        <HStack justify="space-between">
          <Text fontSize="xl" fontWeight="bold">
            NeoGen 游戏
          </Text>
          <HStack gap={4}>
            <Link to="/">
              <Box
                as="button"
                px={4}
                py={2}
                borderRadius="md"
                bg={location.pathname === "/" ? "blue.500" : "transparent"}
                color={location.pathname === "/" ? "white" : "blue.500"}
                borderWidth={1}
                borderColor="blue.500"
                _hover={{
                  bg: location.pathname === "/" ? "blue.600" : "blue.50",
                }}
                transition="all 0.2s"
              >
                首页
              </Box>
            </Link>
            <Link to="/room">
              <Box
                as="button"
                px={4}
                py={2}
                borderRadius="md"
                bg={location.pathname === "/room" ? "blue.500" : "transparent"}
                color={location.pathname === "/room" ? "white" : "blue.500"}
                borderWidth={1}
                borderColor="blue.500"
                _hover={{
                  bg: location.pathname === "/room" ? "blue.600" : "blue.50",
                }}
                transition="all 0.2s"
              >
                房间
              </Box>
            </Link>

            {/* 用户信息和登出按钮 */}
            {isAuthenticated && user ? (
              <HStack gap={2}>
                <Text fontSize="sm" color="gray.600">
                  欢迎, {user.username}
                </Text>
                <Button
                  size="sm"
                  colorPalette="red"
                  variant="outline"
                  onClick={handleLogout}
                >
                  登出
                </Button>
              </HStack>
            ) : null}
          </HStack>
        </HStack>
      </Box>

      {/* 页面内容 */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/room"
          element={
            <AuthGuard>
              <Room />
            </AuthGuard>
          }
        />
      </Routes>

      {/* 全局提示框 */}
      <Toaster />
    </Box>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

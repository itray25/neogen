import React from "react";
import { VStack, Box, SegmentGroup } from "@chakra-ui/react";
import { RegisterForm } from "./RegisterForm";
import { LoginForm } from "./LoginForm";

interface AuthFormsProps {
  onRegisterSuccess?: (user: any) => void;
  onLoginSuccess?: (user: any) => void;
}

export const AuthForms: React.FC<AuthFormsProps> = ({
  onRegisterSuccess,
  onLoginSuccess,
}) => {
  const [value, setValue] = React.useState<string | null>("注册");

  return (
    <VStack gap={6} w="100%" maxW="400px">
      <SegmentGroup.Root
        value={value}
        onValueChange={(e) => setValue(e.value)}
        w="100%"
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Items items={["注册", "登录"]} w="100%" />
      </SegmentGroup.Root>

      <Box w="100%">
        {value === "注册" ? (
          <RegisterForm onRegisterSuccess={onRegisterSuccess} />
        ) : (
          <LoginForm onLoginSuccess={onLoginSuccess} />
        )}
      </Box>
    </VStack>
  );
};

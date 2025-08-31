import React, { useState } from "react";
import { Dialog, Input, Button, VStack, Field } from "@chakra-ui/react";

interface PasswordPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  roomName: string;
}

export const PasswordPrompt: React.FC<PasswordPromptProps> = ({
  isOpen,
  onClose,
  onSubmit,
  roomName,
}) => {
  const [password, setPassword] = useState("");

  const handleSubmit = () => {
    onSubmit(password);
    setPassword("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={({ open }) => !open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>房间 "{roomName}" 需要密码</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Field.Root>
              <Field.Label>请输入密码</Field.Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                autoFocus
              />
            </Field.Root>
          </Dialog.Body>
          <Dialog.Footer>
            <VStack gap={3} direction="row">
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              <Button
                colorPalette="blue"
                onClick={handleSubmit}
                disabled={!password}
              >
                进入房间
              </Button>
            </VStack>
          </Dialog.Footer>
          <Dialog.CloseTrigger />
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
};

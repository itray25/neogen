import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { checkLoginStatus } from "../hooks/checkLoginStatus";
import { toaster } from "@/components/ui/toaster";

interface User {
  user_id: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);

  // 初始化时验证用户身份
  useEffect(() => {
    if (hasInitialized) return;

    const initAuth = async () => {
      setIsLoading(true);
      setHasInitialized(true);

      try {
        const userData = await checkLoginStatus();
        if (userData) {
          setUser(userData);
          console.log("用户认证成功:", userData);
        } else {
          setUser(null);
          // 清理可能被篡改的localStorage
          localStorage.removeItem("user_id");
          localStorage.removeItem("username");
        }
      } catch (error) {
        console.error("认证初始化失败:", error);
        setUser(null);
        localStorage.removeItem("user_id");
        localStorage.removeItem("username");
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [hasInitialized]);

  // 登录函数
  const login = (userData: User) => {
    setUser(userData);
    // 同步到localStorage（作为备份）
    localStorage.setItem("user_id", userData.user_id);
    localStorage.setItem("username", userData.username);

    console.log("用户已登录到Context:", userData);
    toaster.create({
      title: "登录成功",
      description: `欢迎来到NextGen，${userData.username}！`,
      type: "success",
    });
  };

  // 登出函数
  const logout = () => {
    setUser(null);
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");

    console.log("用户已登出");
    toaster.create({
      title: "已登出",
      description: "您已成功登出",
      type: "success",
    });
  };

  // 刷新认证状态（当怀疑数据被篡改时调用）
  const refreshAuth = async () => {
    setIsLoading(true);

    try {
      const userData = await checkLoginStatus();
      if (userData) {
        setUser(userData);
        // 同步localStorage
        localStorage.setItem("user_id", userData.user_id);
        localStorage.setItem("username", userData.username);
      } else {
        setUser(null);
        localStorage.removeItem("user_id");
        localStorage.removeItem("username");
        toaster.create({
          title: "认证失败",
          description: "用户信息验证失败，请重新登录",
          type: "warning",
        });
      }
    } catch (error) {
      console.error("刷新认证失败:", error);
      setUser(null);
      localStorage.removeItem("user_id");
      localStorage.removeItem("username");
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 自定义Hook来使用AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// 高阶组件：需要认证的组件包装器
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> => {
  return (props: P) => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
          }}
        >
          <div>验证用户身份中...</div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
          }}
        >
          <div>未授权访问，请先登录</div>
        </div>
      );
    }

    return <Component {...props} />;
  };
};

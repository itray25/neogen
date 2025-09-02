import { buildApiUrl, API_ENDPOINTS } from "../config/api";

export const checkLoginStatus = async (): Promise<
  { user_id: string; username: string } | false
> => {
  // 读取localStorage中的user_id
  const user_id = localStorage.getItem("user_id");

  // 如果没有读取到user_id，返回false
  if (!user_id) {
    return false;
  }

  try {
    // 调用后端接口获取用户信息
    const response = await fetch(
      buildApiUrl(API_ENDPOINTS.USERS, { user_id }),
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // 如果响应成功
    if (response.ok) {
      const userData = await response.json();

      // 检查返回的数据是否包含username
      if (userData && userData.username) {
        // 更新localStorage中的username
        localStorage.setItem("username", userData.username);
        console.log("用户信息已更新:", userData);
        // 返回用户信息
        return {
          user_id: user_id,
          username: userData.username,
        };
      } else {
        // 如果返回的数据格式不正确，清除localStorage并返回false
        localStorage.removeItem("user_id");
        localStorage.removeItem("username");
        return false;
      }
    } else {
      // 如果后端响应错误（如用户不存在），清除localStorage并返回false
      localStorage.removeItem("user_id");
      localStorage.removeItem("username");
      return false;
    }
  } catch (error) {
    // 如果网络错误或其他异常，清除localStorage并返回false
    console.error("检查登录状态时发生错误:", error);
    localStorage.removeItem("user_id");
    localStorage.removeItem("username");
    return false;
  }
};

// API配置文件
// 根据环境自动确定API基础URL

// 获取当前环境的API基础URL
export const getApiBaseUrl = (): string => {
  // 如果是开发环境，使用开发服务器
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  // 生产环境：使用当前域名
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;

  // 如果有端口号，包含端口号；否则使用默认端口
  if (port && port !== "80" && port !== "443") {
    return `${protocol}//${hostname}:${port}`;
  } else {
    return `${protocol}//${hostname}`;
  }
};

// 获取WebSocket基础URL
export const getWsBaseUrl = (): string => {
  // 如果是开发环境，使用开发服务器
  if (import.meta.env.DEV) {
    return "ws://localhost:3000";
  }

  // 生产环境：使用当前域名，自动判断ws或wss
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;
  const port = window.location.port;

  // 如果有端口号，包含端口号；否则使用默认端口
  if (port && port !== "80" && port !== "443") {
    return `${protocol}//${hostname}:${port}`;
  } else {
    return `${protocol}//${hostname}`;
  }
};

// API端点
export const API_ENDPOINTS = {
  GET_ROOMS: "/api/getRooms",
  CREATE_ROOM: "/api/createRoom",
  USERS: "/api/users",
  GLOBAL_WS: "/global_ws",
} as const;

// 构建完整的API URL
export const buildApiUrl = (
  endpoint: string,
  params?: Record<string, string | number>
): string => {
  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, value.toString());
    });
    url += `?${searchParams.toString()}`;
  }

  return url;
};

// 构建WebSocket URL
export const buildWsUrl = (endpoint: string): string => {
  const baseUrl = getWsBaseUrl();
  return `${baseUrl}${endpoint}`;
};

export default {
  getApiBaseUrl,
  getWsBaseUrl,
  API_ENDPOINTS,
  buildApiUrl,
  buildWsUrl,
};

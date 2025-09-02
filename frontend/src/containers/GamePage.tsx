import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Card,
  Heading,
  Progress,
  Spinner,
  SimpleGrid,
  Badge,
} from "@chakra-ui/react";
import { LuArrowLeft } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { useWebSocket } from "../hooks/websocket";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { wsManager } from "../hooks/wsManager";
import { toaster } from "@/components/ui/toaster";
import type { ChatMessage } from "../hooks/wsManager";

interface MapTile {
  x: number;
  y: number;
  type: string; // 'w', 't', 'm', 'g', 'v'
  count: number;
  userId?: string;
}

interface MoveEvent {
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  timestamp: number;
}

interface MoveTrack {
  id: number;
  moves: MoveEvent[];
  createdAt: number;
}

const GamePage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { gameState } = useWebSocket();

  // 确保WebSocket连接和用户认证
  useAuthenticatedWebSocket();

  // 添加CSS动画样式
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      
      @keyframes arrow-flow {
        0% { stroke-dashoffset: 20; }
        100% { stroke-dashoffset: 0; }
      }
      
      .arrow-animated {
        stroke-dasharray: 5,5;
        animation: arrow-flow 1s linear infinite;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [turnHalf, setTurnHalf] = useState(true);
  const [turnActions, setTurnActions] = useState<[string, string][]>([]);
  const [lastActionSent, setLastActionSent] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [gameMap, setGameMap] = useState<MapTile[]>([]);
  const [selectedTile, setSelectedTile] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isConstructingTrack, setIsConstructingTrack] = useState(false);
  const [playerTeam, setPlayerTeam] = useState<string>("");
  const [playerGroupId, setPlayerGroupId] = useState<number | null>(null);

  // 移动轨迹缓存（支持多个轨迹）
  const [moveTracks, setMoveTracks] = useState<MoveTrack[]>([]);
  const [nextTrackId, setNextTrackId] = useState<number>(1);

  // 定时器引用
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 ref 保存最新状态，避免定时器频繁重建
  const moveTracksRef = useRef(moveTracks);
  const gameMapRef = useRef(gameMap);
  const playerTeamRef = useRef(playerTeam);
  const playerGroupIdRef = useRef(playerGroupId);
  const gameStartedRef = useRef(gameStarted);
  const gameEndedRef = useRef(gameEnded);

  // 保持 ref 与状态同步
  useEffect(() => {
    moveTracksRef.current = moveTracks;
  }, [moveTracks]);

  useEffect(() => {
    gameMapRef.current = gameMap;
  }, [gameMap]);

  useEffect(() => {
    playerTeamRef.current = playerTeam;
  }, [playerTeam]);

  useEffect(() => {
    playerGroupIdRef.current = playerGroupId;
  }, [playerGroupId]);

  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);

  useEffect(() => {
    gameEndedRef.current = gameEnded;
  }, [gameEnded]);

  // 根据组别ID获取队伍信息
  const getTeamInfo = (groupId: number | null) => {
    const teamMap = {
      0: { name: "红队", color: "red", teamId: "team_0" },
      1: { name: "蓝队", color: "blue", teamId: "team_1" },
      2: { name: "绿队", color: "green", teamId: "team_2" },
      3: { name: "黄队", color: "yellow", teamId: "team_3" },
      4: { name: "紫队", color: "purple", teamId: "team_4" },
      5: { name: "青队", color: "cyan", teamId: "team_5" },
      6: { name: "橙队", color: "orange", teamId: "team_6" },
      7: { name: "粉队", color: "pink", teamId: "team_7" },
      8: { name: "观察者", color: "gray", teamId: "observer" },
    };

    if (groupId === null || groupId === undefined) {
      return { name: "未分配", color: "gray", teamId: "" };
    }

    return (
      teamMap[groupId as keyof typeof teamMap] || {
        name: "未知",
        color: "gray",
        teamId: "",
      }
    );
  };

  // 获取当前玩家的队伍信息 - 添加更多依赖项确保及时更新
  useEffect(() => {
    if (roomId) {
      const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
      console.log("更新玩家队伍信息:", {
        roomId,
        currentGroupId,
        currentGroupIdType: typeof currentGroupId,
        currentGroupIdStrictlyEquals0: currentGroupId === 0,
        currentUser: wsManager.getCurrentUser(),
        isConnected: wsManager.isConnected(),
      });

      setPlayerGroupId(currentGroupId);

      if (currentGroupId !== null && currentGroupId !== undefined) {
        const teamInfo = getTeamInfo(currentGroupId);
        setPlayerTeam(teamInfo.teamId);
        console.log("设置玩家队伍:", {
          groupId: currentGroupId,
          groupIdType: typeof currentGroupId,
          teamInfo,
        });
      } else {
        setPlayerTeam("");
        console.log("清空玩家队伍信息 - currentGroupId为null或undefined:", {
          currentGroupId,
          currentGroupIdType: typeof currentGroupId,
        });
      }
    }
  }, [roomId, isAuthenticated, user]); // 添加认证状态依赖项

  // 定期检查队伍信息（防止WebSocket消息丢失）
  useEffect(() => {
    if (!roomId) return;

    const checkTeamInfo = () => {
      const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
      const currentUser = wsManager.getCurrentUser();
      /*
      console.log("定期检查队伍信息:", {
        currentGroupId,
        playerGroupId,
        currentUser,
        isConnected: wsManager.isConnected(),
      });
*/
      // 如果当前没有队伍信息但应该有，更新它
      if (currentGroupId !== null && currentGroupId !== playerGroupId) {
        console.log("检测到队伍信息变化，更新:", {
          old: playerGroupId,
          new: currentGroupId,
          isGroupZero: currentGroupId === 0,
        });
        setPlayerGroupId(currentGroupId);
        const teamInfo = getTeamInfo(currentGroupId);
        setPlayerTeam(teamInfo.teamId);
      }
    };

    // 立即检查一次
    checkTeamInfo();

    // 每3秒检查一次
    const interval = setInterval(checkTeamInfo, 3000);

    return () => clearInterval(interval);
  }, [roomId, playerGroupId]);

  // 监听游戏状态变化
  useEffect(() => {
    console.log("游戏状态变化:", {
      gameStarted,
      gameEnded,
      playerTeam,
      playerGroupId,
      mapLength: gameMap.length,
    });
  }, [gameStarted, gameEnded, playerTeam, playerGroupId, gameMap.length]);

  // 验证移动是否可执行（检查起始位置是否有足够兵力且属于玩家）
  const canExecuteMove = (
    move: MoveEvent,
    currentMap: MapTile[],
    currentTeam: string
  ): boolean => {
    console.log("验证移动:", {
      move,
      currentTeam,
      mapLength: currentMap.length,
    });

    const fromTile = currentMap.find(
      (tile) => tile.x === move.from_x && tile.y === move.from_y
    );

    console.log("找到起始瓦片:", fromTile);

    if (!fromTile) {
      console.log("未找到起始瓦片");
      return false;
    }

    // 检查是否是玩家控制的瓦片
    if (fromTile.userId !== currentTeam) {
      console.log("瓦片不属于当前队伍:", {
        fromTileUserId: fromTile.userId,
        currentTeam,
      });
      return false;
    }

    // 检查是否有足够兵力（需要至少2兵力才能移动1兵力）
    if (fromTile.count <= 1) {
      console.log("兵力不足:", { count: fromTile.count });
      return false;
    }

    console.log("移动验证通过");
    return true;
  };

  // 定时器：每1秒检查并发送移动事件（优化：使用ref避免重建）
  useEffect(() => {
    // 清理之前的定时器
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current);
    }

    // 启动新的定时器：每1秒检查并发送移动事件
    sendIntervalRef.current = setInterval(() => {
      const currentTracks = moveTracksRef.current;
      const currentMap = gameMapRef.current;
      const currentTeam = playerTeamRef.current;
      const currentGameStarted = gameStartedRef.current;
      const currentGameEnded = gameEndedRef.current;
      /*
      console.log("定时器检查状态:", {
        tracksCount: currentTracks.length,
        gameStarted: currentGameStarted,
        gameEnded: currentGameEnded,
        team: currentTeam,
        mapLength: currentMap.length,
      });
*/
      // 检查是否有游戏数据（地图和队伍）
      const hasGameData = currentMap.length > 0 && currentTeam;

      // 只有在游戏开始（或有游戏数据）且未结束时才处理移动事件
      if ((!currentGameStarted && !hasGameData) || currentGameEnded) {
        console.log("游戏未开始或已结束，跳过移动处理", {
          gameStarted: currentGameStarted,
          hasGameData,
          gameEnded: currentGameEnded,
        });
        return;
      }

      if (currentTracks.length > 0) {
        const currentTrack = currentTracks[0];
        console.log("检查当前轨迹:", currentTrack);
        console.log("轨迹详细信息:", {
          tracksLength: currentTracks.length,
          firstTrackId: currentTrack?.id,
          firstTrackMoves: currentTrack?.moves?.length,
          allTracks: currentTracks.map((t) => ({
            id: t.id,
            movesCount: t.moves.length,
          })),
        });

        if (
          currentTrack &&
          currentTrack.moves &&
          currentTrack.moves.length > 0
        ) {
          const moveToSend = currentTrack.moves[0];
          console.log("准备发送移动:", moveToSend);

          // 验证移动是否可执行
          if (canExecuteMove(moveToSend, currentMap, currentTeam)) {
            console.log("移动验证通过，即将发送");
            // 发送到后端
            sendMove(
              moveToSend.from_x,
              moveToSend.from_y,
              moveToSend.to_x,
              moveToSend.to_y
            );

            console.log("发送移动事件:", moveToSend);
            console.log("当前队伍:", currentTeam);
            console.log("游戏状态:", {
              started: currentGameStarted,
              ended: currentGameEnded,
            });

            // 从当前轨迹中删除已发送的事件
            setMoveTracks((prev) => {
              const newTracks = [...prev];
              if (newTracks.length > 0 && newTracks[0] && newTracks[0].moves) {
                newTracks[0] = {
                  ...newTracks[0],
                  moves: newTracks[0].moves.slice(1),
                };

                // 如果当前轨迹为空，删除整个轨迹
                if (newTracks[0].moves.length === 0) {
                  newTracks.shift();
                }
              }

              return newTracks;
            });
          } else {
            console.log("移动无法执行，删除整个轨迹:", moveToSend);

            // 删除当前整个轨迹
            setMoveTracks((prev) => prev.slice(1));

            toaster.create({
              title: "移动失败",
              description: `无法执行移动 (${moveToSend.from_x},${moveToSend.from_y}) → (${moveToSend.to_x},${moveToSend.to_y})，已删除相关轨迹`,
              type: "warning",
              duration: 2000,
            });
          }
        } else {
          // 当前轨迹为空，删除它
          setMoveTracks((prev) => prev.slice(1));
        }
      }
    }, 500); // 改为500毫秒间隔，降低频率

    // 清理函数
    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, []); // 空依赖数组，避免定时器重建

  // 取消轨迹构建
  const cancelTrackConstruction = () => {
    setSelectedTile(null);
    setIsConstructingTrack(false);
  };

  // 清空所有移动轨迹缓存
  const clearAllMoveTracks = () => {
    setMoveTracks([]);
    setSelectedTile(null);
    setIsConstructingTrack(false);
  };

  // 初始化：请求房间信息检查游戏状态
  useEffect(() => {
    if (roomId && !isInitialized) {
      console.log("初始化游戏页面，请求房间信息:", roomId);
      setIsInitialized(true);
      wsManager.send({
        type: "get_room_info",
        room_id: roomId,
      });
    }
  }, [roomId, isInitialized]);

  // 发送游戏动作
  const sendAction = (action: string) => {
    // 使用 ref 中的最新状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    const hasGameData = currentMap.length > 0 && currentTeam;

    if (!roomId || (!currentGameStarted && !hasGameData) || currentGameEnded)
      return;

    wsManager.sendGameAction(roomId, action);
    setLastActionSent(action);

    toaster.create({
      title: "动作已发送",
      description: `已发送动作：${action}`,
      type: "success",
      duration: 1000,
    });
  };

  // 发送移动命令（已禁用乐观更新，等待权威数据）
  const sendMove = (fromX: number, fromY: number, toX: number, toY: number) => {
    // 使用 ref 中的最新状态，而不是 React 状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;

    // 如果有地图数据和队伍信息，但 gameStarted 仍为 false，可能是状态同步问题
    const hasGameData = currentMap.length > 0 && currentTeam;

    if (!roomId || (!currentGameStarted && !hasGameData) || currentGameEnded) {
      console.log("sendMove 被阻止:", {
        roomId,
        gameStarted: currentGameStarted,
        gameEnded: currentGameEnded,
        hasGameData,
        mapLength: currentMap.length,
        playerTeam: currentTeam,
      });
      return;
    }

    console.log("调用 wsManager.sendGameMove:", {
      roomId,
      fromX,
      fromY,
      toX,
      toY,
    });
    // 禁用乐观更新，直接发送到后端，等待权威地图更新
    wsManager.sendGameMove(roomId, fromX, fromY, toX, toY);

    toaster.create({
      title: "移动命令已发送",
      description: `从 (${fromX},${fromY}) 移动到 (${toX},${toY})`,
      type: "success",
      duration: 1000,
    });
  };

  // 键盘控制移动
  const handleKeyDown = (event: KeyboardEvent) => {
    // 使用 ref 中的最新状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    const hasGameData = currentMap.length > 0 && currentTeam;

    if (
      (!currentGameStarted && !hasGameData) ||
      currentGameEnded ||
      !selectedTile
    )
      return;

    let newX = selectedTile.x;
    let newY = selectedTile.y;

    switch (event.key.toLowerCase()) {
      case "w": // 向上移动
      case "arrowup":
        newY = Math.max(0, selectedTile.y - 1);
        break;
      case "s": // 向下移动
      case "arrowdown":
        newY = Math.min(4, selectedTile.y + 1);
        break;
      case "a": // 向左移动
      case "arrowleft":
        newX = Math.max(0, selectedTile.x - 1);
        break;
      case "d": // 向右移动
      case "arrowright":
        newX = Math.min(4, selectedTile.x + 1);
        break;
      case "escape": // ESC 取消选择
        cancelTrackConstruction();
        return;
      case "c": // C 键清空队列
        clearAllMoveTracks();
        return;
      default:
        return;
    }

    // 如果位置没有变化，忽略
    if (newX === selectedTile.x && newY === selectedTile.y) return;

    // 阻止默认行为
    event.preventDefault();

    // 执行移动
    handleTileClick(newX, newY);
  };

  // 监听键盘事件
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedTile, gameStarted, gameEnded]);

  // 检查移动是否合法（只能移动到相邻格子）
  const isValidMove = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) => {
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    // 只允许移动到相邻的格子（上下左右，不包括斜对角）
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  };

  // 检查瓦片是否可以被玩家选择作为起点
  const canSelectTile = (x: number, y: number): boolean => {
    const tile = gameMap.find((t) => t.x === x && t.y === y);
    if (!tile) {
      console.log(`canSelectTile: 未找到瓦片 (${x}, ${y})`);
      return false;
    }

    console.log(`canSelectTile: 检查瓦片 (${x}, ${y})`, {
      tile,
      playerTeam,
      playerGroupId,
      match: tile.userId === playerTeam,
    });

    // 只能选择自己控制的领地(t)或王城(g)，且需要有足够兵力移动
    if (tile.type === "t" || tile.type === "g") {
      const isOwned = tile.userId === playerTeam;
      const hasEnoughTroops = tile.count > 1;

      console.log(`canSelectTile: 详细检查`, {
        tileType: tile.type,
        tileUserId: tile.userId,
        playerTeam,
        isOwned,
        hasEnoughTroops,
        tileCount: tile.count,
      });

      return isOwned && hasEnoughTroops;
    }

    return false;
  };

  // 处理瓦片点击 - 构建移动轨迹
  const handleTileClick = (x: number, y: number) => {
    // 使用 ref 中的最新状态
    const currentGameStarted = gameStartedRef.current;
    const currentGameEnded = gameEndedRef.current;
    const currentMap = gameMapRef.current;
    const currentTeam = playerTeamRef.current;
    const hasGameData = currentMap.length > 0 && currentTeam;

    if ((!currentGameStarted && !hasGameData) || currentGameEnded) {
      console.log("游戏未开始或已结束，无法点击瓦片", {
        gameStarted: currentGameStarted,
        hasGameData,
        gameEnded: currentGameEnded,
      });
      return;
    }

    if (!selectedTile) {
      // 第一次点击：选择起始瓦片，需要检查权限
      if (!canSelectTile(x, y)) {
        toaster.create({
          title: "无法选择",
          description: `无法选择此位置 (${x},${y})，只能选择自己控制且有足够兵力的领地或王城`,
          type: "warning",
          duration: 2000,
        });
        return;
      }

      setSelectedTile({ x, y });
      setIsConstructingTrack(true);
      toaster.create({
        title: "选择起点",
        description: `已选择起点 (${x},${y})，请选择目标位置`,
        type: "info",
        duration: 1500,
      });
    } else {
      // 检查是否与当前选择的位置相邻
      const isAdjacent = isValidMove(selectedTile.x, selectedTile.y, x, y);

      if (!isAdjacent) {
        // 如果不相邻，检查是否可以选择为新的起点
        if (!canSelectTile(x, y)) {
          toaster.create({
            title: "无法选择",
            description: `无法选择此位置 (${x},${y})，只能选择自己控制且有足够兵力的领地或王城`,
            type: "warning",
            duration: 2000,
          });
          return;
        }

        // 将点击的位置设为新的起点
        setSelectedTile({ x, y });
        setIsConstructingTrack(true);

        toaster.create({
          title: "重新选择起点",
          description: `位置不相邻，已将 (${x},${y}) 设为新起点`,
          type: "info",
          duration: 1500,
        });
        return;
      }

      // 创建移动事件
      const newMove: MoveEvent = {
        from_x: selectedTile.x,
        from_y: selectedTile.y,
        to_x: x,
        to_y: y,
        timestamp: Date.now(),
      };

      // 检查是否可以添加到现有轨迹 - 使用ref获取最新状态
      const currentMoveTracks = moveTracksRef.current;
      const lastTrack = currentMoveTracks[currentMoveTracks.length - 1];
      let shouldCreateNewTrack = true;

      console.log("轨迹连接检查:", {
        moveTracksLength: currentMoveTracks.length,
        lastTrack,
        newMove,
        selectedTile,
        usingRef: true,
      });

      if (lastTrack && lastTrack.moves && lastTrack.moves.length > 0) {
        // 检查是否可以连接到最后一个轨迹
        const lastMove = lastTrack.moves[lastTrack.moves.length - 1];
        console.log("检查轨迹连接:", {
          lastMove,
          canConnect:
            lastMove.to_x === newMove.from_x &&
            lastMove.to_y === newMove.from_y,
        });

        if (
          lastMove.to_x === newMove.from_x &&
          lastMove.to_y === newMove.from_y
        ) {
          // 可以连接到现有轨迹
          shouldCreateNewTrack = false;
          console.log("连接到现有轨迹");
          setMoveTracks((prev) => {
            const newTracks = [...prev];
            const lastIndex = newTracks.length - 1;
            if (lastIndex >= 0 && newTracks[lastIndex]) {
              newTracks[lastIndex] = {
                ...newTracks[lastIndex],
                moves: [...newTracks[lastIndex].moves, newMove],
              };
            }
            // 立即更新ref以确保定时器能看到最新状态
            moveTracksRef.current = newTracks;
            return newTracks;
          });
        }
      }

      if (shouldCreateNewTrack) {
        console.log("创建新轨迹:", newMove);
        // 创建新轨迹
        const newTrack: MoveTrack = {
          id: nextTrackId,
          moves: [newMove],
          createdAt: Date.now(),
        };

        setMoveTracks((prev) => {
          const newTracks = [...prev, newTrack];
          // 立即更新ref以确保定时器能看到最新状态
          moveTracksRef.current = newTracks;
          return newTracks;
        });
        setNextTrackId((prev) => prev + 1);
      }

      console.log("添加移动到轨迹:", newMove);
      console.log("当前游戏状态:", {
        moveTracks:
          moveTracksRef.current.length + (shouldCreateNewTrack ? 1 : 0),
        playerTeam,
        gameStarted: currentGameStarted,
        gameEnded: currentGameEnded,
        mapLength: currentMap.length,
        hasGameData: currentMap.length > 0 && playerTeam,
        shouldCreateNewTrack,
        nextTrackId,
        actualRefLength: moveTracksRef.current.length,
      });
      console.log(
        "当前移动轨迹数量:",
        moveTracksRef.current.length + (shouldCreateNewTrack ? 1 : 0)
      );

      toaster.create({
        title: "添加移动",
        description: `从 (${selectedTile.x},${selectedTile.y}) 到 (${x},${y})`,
        type: "success",
        duration: 1000,
      });

      // 将目标位置设为新的起始位置，方便连续移动
      setSelectedTile({ x, y });
    }
  };

  // 获取格子在地图中的像素位置
  const getTilePosition = (x: number, y: number) => {
    const tileSize = 60; // 300px / 5 = 60px per tile
    return {
      x: x * tileSize + tileSize / 2, // 中心位置
      y: y * tileSize + tileSize / 2,
    };
  };

  // 渲染移动箭头 - 现代化简洁版本
  const renderMoveArrows = () => {
    const arrows: JSX.Element[] = [];
    let arrowId = 0;

    moveTracks.forEach((track, trackIndex) => {
      if (track && track.moves && track.moves.length > 0) {
        // 合并连续的同方向移动为路径
        const paths: {
          points: { x: number; y: number }[];
          isFirst: boolean;
        }[] = [];
        let currentPath: { x: number; y: number }[] = [];

        track.moves.forEach((move, moveIndex) => {
          const fromPos = getTilePosition(move.from_x, move.from_y);
          const toPos = getTilePosition(move.to_x, move.to_y);

          if (currentPath.length === 0) {
            // 开始新路径
            currentPath = [fromPos, toPos];
          } else {
            // 检查是否可以连接到当前路径
            const lastPoint = currentPath[currentPath.length - 1];
            if (lastPoint.x === fromPos.x && lastPoint.y === fromPos.y) {
              // 可以连接，添加到当前路径
              currentPath.push(toPos);
            } else {
              // 不能连接，完成当前路径并开始新路径
              if (currentPath.length > 0) {
                paths.push({
                  points: [...currentPath],
                  isFirst: trackIndex === 0 && paths.length === 0,
                });
              }
              currentPath = [fromPos, toPos];
            }
          }
        });

        // 添加最后一个路径
        if (currentPath.length > 0) {
          paths.push({
            points: [...currentPath],
            isFirst: trackIndex === 0 && paths.length === 0,
          });
        }

        // 渲染路径
        paths.forEach((path, pathIndex) => {
          const isCurrentTrack = trackIndex === 0;
          const isFirstPath = path.isFirst;

          // 更现代的颜色方案
          const color = isFirstPath
            ? "#ef4444" // 红色 - 即将执行
            : isCurrentTrack
              ? "#3b82f6" // 蓝色 - 当前轨迹
              : "#9ca3af"; // 灰色 - 其他轨迹

          const opacity = isFirstPath ? 1.0 : isCurrentTrack ? 0.8 : 0.4;
          const strokeWidth = isFirstPath ? 3 : 2;

          // 生成路径字符串
          let pathString = `M ${path.points[0].x} ${path.points[0].y}`;
          for (let i = 1; i < path.points.length; i++) {
            pathString += ` L ${path.points[i].x} ${path.points[i].y}`;
          }

          arrows.push(
            <g key={`path-${arrowId++}`}>
              {/* 主路径 */}
              <path
                d={pathString}
                stroke={color}
                strokeWidth={strokeWidth}
                opacity={opacity}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#arrowhead)"
                className={isFirstPath ? "arrow-animated" : ""}
              />

              {/* 起点标记 */}
              <circle
                cx={path.points[0].x}
                cy={path.points[0].y}
                r={isFirstPath ? 4 : 3}
                fill={color}
                opacity={opacity * 0.8}
              />

              {/* 终点标记（箭头已经在markerEnd中） */}
              {path.points.length > 2 && (
                <circle
                  cx={path.points[path.points.length - 1].x}
                  cy={path.points[path.points.length - 1].y}
                  r={2}
                  fill={color}
                  opacity={opacity * 0.6}
                />
              )}
            </g>
          );
        });
      }
    });

    return arrows;
  };

  // 获取格子显示颜色
  const getTileColor = (tile: MapTile) => {
    // 检查是否是当前选择的格子
    if (
      selectedTile &&
      selectedTile.x === tile.x &&
      selectedTile.y === tile.y
    ) {
      return "yellow.400";
    }

    switch (tile.type) {
      case "w":
        return "gray.200"; // 无主地
      case "t":
        // 根据 userId 获取对应的颜色
        if (tile.userId?.startsWith("team_")) {
          const groupId = parseInt(tile.userId.replace("team_", ""));
          const teamInfo = getTeamInfo(groupId);
          return `${teamInfo.color}.300`;
        }
        return "gray.300";
      case "g":
        // 根据 userId 获取对应的颜色
        if (tile.userId?.startsWith("team_")) {
          const groupId = parseInt(tile.userId.replace("team_", ""));
          const teamInfo = getTeamInfo(groupId);
          return `${teamInfo.color}.500`;
        }
        return "gray.500";
      case "m":
        return "brown.400"; // 山
      case "v":
        return "transparent"; // 空白
      default:
        return "gray.100";
    }
  };

  // 获取格子显示文本
  const getTileText = (tile: MapTile) => {
    switch (tile.type) {
      case "w":
        return "W";
      case "t":
        return tile.count.toString();
      case "g":
        return `👑${tile.count}`; // 王城显示兵力
      case "m":
        return "⛰️";
      case "v":
        return "";
      default:
        return "?";
    }
  };

  // 监听WebSocket消息
  useEffect(() => {
    const unsubscribeMessages = wsManager.subscribeToMessages(
      (message: ChatMessage) => {
        switch (message.type) {
          case "room_info":
            console.log("收到 room_info 消息:", message);
            // 检查房间状态，如果是playing说明游戏正在进行
            if (message.room_id == roomId && message.status === "playing") {
              console.log("设置游戏开始状态为 true");
              setGameStarted(true);
              setGameEnded(false);
            } else if (
              message.room_id == roomId &&
              message.status !== "playing"
            ) {
              console.log("游戏未开始，房间状态:", message.status);
              // 游戏不在进行中，返回房间页面
              toaster.create({
                title: "游戏未开始",
                description: "当前没有游戏在进行，返回房间",
                type: "info",
              });
              setTimeout(() => {
                navigate(`/rooms/${roomId}`);
              }, 1000);
            }

            // 更新玩家组别信息
            if (message.room_id == roomId && roomId) {
              const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
              if (currentGroupId !== null && currentGroupId !== playerGroupId) {
                setPlayerGroupId(currentGroupId);
                const teamInfo = getTeamInfo(currentGroupId);
                setPlayerTeam(teamInfo.teamId);
                console.log("从 room_info 更新玩家队伍信息:", {
                  groupId: currentGroupId,
                  teamInfo,
                });
              }
            }
            break;

          case "start_game":
            console.log("收到 start_game 消息:", message);
            if (message.room_id == roomId) {
              console.log("设置游戏开始状态为 true (start_game)");
              setGameStarted(true);
              setGameEnded(false);
              setCurrentTurn(0);
              setTurnHalf(true);
              setTurnActions([]);
              setLastActionSent("");
              toaster.create({
                title: "游戏开始",
                description: "游戏正在进行中...",
                type: "success",
              });
            }
            break;

          case "game_turn_update":
            //console.log("收到 game_turn_update 消息:", message);
            if (message.room_id == roomId) {
              const newTurn = message.turn || 0;
              const newTurnHalf = message.turn_half ?? true;

              setCurrentTurn(newTurn);
              setTurnHalf(newTurnHalf);
              setTurnActions(message.actions || []);

              // 如果收到game_turn_update但游戏还没开始，说明游戏已经在进行
              if (!gameStarted) {
                console.log("通过 game_turn_update 设置游戏开始状态为 true");
                setGameStarted(true);
                setGameEnded(false);
              }
            }
            break;

          case "map_update":
            //console.log("收到 map_update 消息:", message);
            if (message.room_id == roomId && message.visible_tiles) {
              // 如果收到地图更新但游戏还没开始，说明游戏已经在进行
              if (!gameStarted) {
                console.log("通过 map_update 设置游戏开始状态为 true");
                setGameStarted(true);
                setGameEnded(false);
              }

              // 更新地图数据（权威数据，覆盖乐观更新）
              const newMap: MapTile[] = message.visible_tiles.map(
                ([x, y, type, count, userId]) => ({
                  x,
                  y,
                  type,
                  count,
                  userId: userId || undefined,
                })
              );

              // 立即更新地图，确保权威数据覆盖乐观更新
              setGameMap(newMap);

              // 检查当前轨迹的第一个移动是否仍然可执行
              if (moveTracks.length > 0) {
                const currentTrack = moveTracks[0];
                if (
                  currentTrack &&
                  currentTrack.moves &&
                  currentTrack.moves.length > 0
                ) {
                  const firstMove = currentTrack.moves[0];
                  const fromTile = newMap.find(
                    (tile) =>
                      tile.x === firstMove.from_x && tile.y === firstMove.from_y
                  );

                  if (
                    !fromTile ||
                    fromTile.userId !== playerTeam ||
                    fromTile.count <= 1
                  ) {
                    console.log("地图更新后，当前轨迹不可执行，删除整个轨迹");
                    setMoveTracks((prev) => prev.slice(1));

                    toaster.create({
                      title: "轨迹失效",
                      description: "地图更新后当前轨迹不可执行，已自动删除",
                      type: "warning",
                      duration: 2000,
                    });
                  }
                }
              }

              // 更新玩家队伍信息（从 wsManager 获取，而不是推断）
              if (roomId) {
                const currentGroupId = wsManager.getCurrentPlayerGroup(roomId);
                if (
                  currentGroupId !== null &&
                  currentGroupId !== playerGroupId
                ) {
                  setPlayerGroupId(currentGroupId);
                  const teamInfo = getTeamInfo(currentGroupId);
                  setPlayerTeam(teamInfo.teamId);
                  console.log("更新玩家队伍信息:", {
                    groupId: currentGroupId,
                    teamInfo,
                  });
                }
              }
            }
            break;

          case "game_win":
            if (message.room_id == roomId) {
              setGameEnded(true);
              toaster.create({
                title: "游戏结束",
                description: `${message.winner} 获得胜利！`,
                type: "success",
              });
              setTimeout(() => {
                navigate(`/rooms/${roomId}`);
              }, 3000);
            }
            break;

          case "end_game":
            if (message.room_id == roomId) {
              setGameEnded(true);
              // 清空移动轨迹
              setMoveTracks([]);
              setSelectedTile(null);
              setIsConstructingTrack(false);
              toaster.create({
                title: "游戏结束",
                description: "游戏已结束，即将返回房间",
                type: "info",
              });
              // 2秒后返回房间页面
              setTimeout(() => {
                navigate(`/rooms/${roomId}`);
              }, 2000);
            }
            break;

          case "error":
            toaster.create({
              title: "错误",
              description: message.message || "发生未知错误",
              type: "error",
            });
            break;
        }
      }
    );

    return () => unsubscribeMessages();
  }, [roomId, navigate, gameStarted]);

  // 如果没有游戏开始，显示等待界面
  useEffect(() => {
    if (!gameStarted && !gameEnded) {
      // 如果页面直接访问而没有游戏开始，15秒后返回房间（给足够时间接收消息）
      const timeout = setTimeout(() => {
        if (!gameStarted && !gameEnded) {
          toaster.create({
            title: "游戏未开始",
            description: "长时间未收到游戏开始信号，返回房间",
            type: "warning",
          });
          navigate(`/rooms/${roomId}`);
        }
      }, 15000);

      return () => clearTimeout(timeout);
    }
  }, [gameStarted, gameEnded, roomId, navigate]);

  const handleBackToRoom = () => {
    navigate(`/rooms/${roomId}`);
  };

  if (!roomId) {
    return (
      <Box p={8} textAlign="center">
        <Text>无效的房间ID</Text>
        <Button mt={4} onClick={() => navigate("/room")}>
          返回房间列表
        </Button>
      </Box>
    );
  }

  return (
    <Box p={6} maxW="800px" mx="auto">
      {/* 游戏头部 */}
      <Card.Root mb={6}>
        <Card.Body>
          <HStack justify="space-between" align="center">
            <HStack gap={4}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToRoom}
                disabled={gameStarted && !gameEnded}
              >
                <LuArrowLeft />
                返回房间
              </Button>
              <Heading size="lg">房间 {roomId} - 游戏中</Heading>
            </HStack>
          </HStack>
        </Card.Body>
      </Card.Root>

      {/* 游戏内容 */}
      <VStack gap={6}>
        {!gameStarted && !gameEnded && (
          <Card.Root w="full">
            <Card.Body>
              <VStack align="center" justify="center" py={20}>
                <Spinner size="xl" colorPalette="blue" />
                <Text fontSize="xl" fontWeight="semibold">
                  等待游戏开始...
                </Text>
                <Text fontSize="sm" color="gray.500">
                  如果长时间等待，将自动返回房间
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        )}

        {gameStarted && !gameEnded && (
          <VStack gap={4} w="full">
            {/* 游戏状态栏 */}
            <Card.Root w="full">
              <Card.Body>
                <HStack justify="space-between" align="center">
                  <VStack align="start" gap={1}>
                    <Text fontSize="lg" fontWeight="bold">
                      回合 {currentTurn} {turnHalf ? "(上半)" : "(下半)"}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {turnHalf ? "处理顺序：从小到大" : "处理顺序：从大到小"}
                    </Text>
                  </VStack>
                  <VStack align="end" gap={1}>
                    <Badge colorPalette={getTeamInfo(playerGroupId).color}>
                      {getTeamInfo(playerGroupId).name}
                    </Badge>
                    <Text fontSize="sm">
                      组别: {playerGroupId !== null ? playerGroupId : "未分配"}
                    </Text>
                  </VStack>
                </HStack>
              </Card.Body>
            </Card.Root>

            {/* 游戏地图 */}
            <Card.Root w="full">
              <Card.Header>
                <Heading size="md" textAlign="center">
                  游戏地图
                </Heading>
                <Text fontSize="sm" textAlign="center" color="gray.500">
                  点击第一个瓦片选择起点，点击第二个瓦片添加移动到轨迹
                  <br />
                  键盘控制：WASD或方向键移动，ESC取消选择，C键清空队列
                  {isConstructingTrack && (
                    <Badge ml={2} colorScheme="orange">
                      正在构建轨迹
                    </Badge>
                  )}
                </Text>
              </Card.Header>
              <Card.Body>
                {gameMap.length > 0 ? (
                  <Box data-map-area position="relative">
                    <Box
                      display="grid"
                      gridTemplateColumns="repeat(5, 1fr)"
                      gridTemplateRows="repeat(5, 1fr)"
                      gap={0}
                      width="300px"
                      height="300px"
                      border="2px solid"
                      borderColor="gray.600"
                      data-map-area
                    >
                      {Array.from({ length: 25 }, (_, i) => {
                        const x = i % 5;
                        const y = Math.floor(i / 5);
                        const tile = gameMap.find(
                          (t) => t.x === x && t.y === y
                        );

                        if (!tile) {
                          return (
                            <Box
                              key={i}
                              bg="gray.100"
                              border="1px solid"
                              borderColor="gray.400"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              fontSize="xs"
                              color="gray.400"
                            >
                              ?
                            </Box>
                          );
                        }

                        return (
                          <Box
                            key={i}
                            bg={getTileColor(tile)}
                            border={
                              selectedTile &&
                              selectedTile.x === x &&
                              selectedTile.y === y
                                ? "3px solid gold"
                                : "1px solid"
                            }
                            borderColor={
                              selectedTile &&
                              selectedTile.x === x &&
                              selectedTile.y === y
                                ? "gold"
                                : "gray.400"
                            }
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="sm"
                            fontWeight="bold"
                            cursor="pointer"
                            position="relative"
                            _hover={{
                              bgColor:
                                tile.type !== "v"
                                  ? `${getTileColor(tile).split(".")[0]}.400`
                                  : "gray.200",
                              transition: "background-color 0.1s",
                            }}
                            onClick={() => handleTileClick(x, y)}
                          >
                            {getTileText(tile)}
                            {/* 选中高亮效果 */}
                            {selectedTile &&
                              selectedTile.x === x &&
                              selectedTile.y === y && (
                                <Box
                                  position="absolute"
                                  top="0"
                                  left="0"
                                  right="0"
                                  bottom="0"
                                  bg="yellow.200"
                                  opacity="0.4"
                                  pointerEvents="none"
                                  animation="pulse 2s infinite"
                                />
                              )}
                          </Box>
                        );
                      })}
                    </Box>

                    {/* SVG箭头覆盖层 */}
                    {moveTracks.length > 0 && (
                      <Box
                        position="absolute"
                        top="0"
                        left="0"
                        width="300px"
                        height="300px"
                        pointerEvents="none"
                        zIndex="10"
                      >
                        <svg
                          width="300"
                          height="300"
                          style={{ position: "absolute", top: 0, left: 0 }}
                        >
                          {/* 定义现代化箭头标记 */}
                          <defs>
                            <marker
                              id="arrowhead"
                              markerWidth="8"
                              markerHeight="8"
                              refX="7"
                              refY="4"
                              orient="auto"
                              markerUnits="strokeWidth"
                            >
                              <path
                                d="M0,0 L0,8 L8,4 z"
                                fill="currentColor"
                                stroke="none"
                              />
                            </marker>
                          </defs>
                          {renderMoveArrows()}
                        </svg>
                      </Box>
                    )}

                    {/* 地图图例 */}
                    <Box mt={4} p={3} bg="gray.50" borderRadius="md">
                      <Text fontSize="sm" fontWeight="semibold" mb={2}>
                        图例:
                      </Text>
                      <VStack align="stretch" gap={2}>
                        <HStack wrap="wrap" gap={4}>
                          <HStack>
                            <Box
                              w="20px"
                              h="20px"
                              bg="gray.200"
                              borderRadius="sm"
                            />
                            <Text fontSize="xs">无主地(W)</Text>
                          </HStack>
                          <HStack>
                            <Box
                              w="20px"
                              h="20px"
                              bg="brown.400"
                              borderRadius="sm"
                            />
                            <Text fontSize="xs">山(⛰️)</Text>
                          </HStack>
                        </HStack>

                        <Text fontSize="xs" fontWeight="semibold">
                          队伍领地:
                        </Text>
                        <HStack wrap="wrap" gap={3}>
                          {[0, 1, 2, 3, 4, 5, 6, 7].map((groupId) => {
                            const teamInfo = getTeamInfo(groupId);
                            return (
                              <HStack key={groupId}>
                                <Box
                                  w="20px"
                                  h="20px"
                                  bg={`${teamInfo.color}.300`}
                                  borderRadius="sm"
                                />
                                <Text fontSize="xs">{teamInfo.name}</Text>
                              </HStack>
                            );
                          })}
                        </HStack>

                        <Text fontSize="xs" fontWeight="semibold">
                          王城:
                        </Text>
                        <HStack wrap="wrap" gap={3}>
                          {[0, 1, 2, 3, 4, 5, 6, 7].map((groupId) => {
                            const teamInfo = getTeamInfo(groupId);
                            return (
                              <HStack key={groupId}>
                                <Box
                                  w="20px"
                                  h="20px"
                                  bg={`${teamInfo.color}.500`}
                                  borderRadius="sm"
                                />
                                <Text fontSize="xs">👑 {teamInfo.name}</Text>
                              </HStack>
                            );
                          })}
                        </HStack>
                      </VStack>
                    </Box>

                    {/* 移动缓存状态 */}
                    {(moveTracks.length > 0 || isConstructingTrack) && (
                      <Box
                        mt={4}
                        p={3}
                        bg="blue.50"
                        borderRadius="md"
                        border="1px solid"
                        borderColor="blue.200"
                      >
                        <Text
                          fontSize="sm"
                          fontWeight="semibold"
                          mb={2}
                          color="blue.700"
                        >
                          移动队列状态:
                        </Text>
                        <VStack align="stretch" gap={2}>
                          {isConstructingTrack && (
                            <HStack>
                              <Badge colorPalette="orange" size="sm">
                                正在构建轨迹
                              </Badge>
                              {selectedTile && (
                                <Text fontSize="xs" color="gray.600">
                                  当前选择: ({selectedTile.x}, {selectedTile.y})
                                </Text>
                              )}
                            </HStack>
                          )}
                          {moveTracks.length > 0 && (
                            <VStack align="stretch" gap={1}>
                              <Text fontSize="xs" color="gray.600">
                                轨迹数: {moveTracks.length}个，总移动数:{" "}
                                {moveTracks.reduce(
                                  (sum, track) =>
                                    sum +
                                    (track && track.moves
                                      ? track.moves.length
                                      : 0),
                                  0
                                )}
                                个
                              </Text>
                              {/* 显示前几个轨迹的移动 */}
                              {moveTracks
                                .slice(0, 3)
                                .map((track, trackIndex) => (
                                  <VStack
                                    key={track.id}
                                    align="stretch"
                                    gap={1}
                                  >
                                    <Text
                                      fontSize="xs"
                                      fontWeight="semibold"
                                      color="blue.600"
                                    >
                                      轨迹 {track.id} (
                                      {track && track.moves
                                        ? track.moves.length
                                        : 0}{" "}
                                      个移动):
                                    </Text>
                                    {track &&
                                      track.moves &&
                                      track.moves
                                        .slice(0, 3)
                                        .map((move, moveIndex) => (
                                          <Text
                                            key={moveIndex}
                                            fontSize="xs"
                                            color="gray.500"
                                            bg={
                                              trackIndex === 0 &&
                                              moveIndex === 0
                                                ? "yellow.100"
                                                : "transparent"
                                            }
                                            p={1}
                                            borderRadius="sm"
                                            ml={2}
                                          >
                                            {trackIndex === 0 && moveIndex === 0
                                              ? "即将发送: "
                                              : `${moveIndex + 1}. `}
                                            ({move.from_x},{move.from_y}) → (
                                            {move.to_x},{move.to_y})
                                          </Text>
                                        ))}
                                    {track &&
                                      track.moves &&
                                      track.moves.length > 3 && (
                                        <Text
                                          fontSize="xs"
                                          color="gray.400"
                                          ml={2}
                                        >
                                          ... 还有 {track.moves.length - 3}{" "}
                                          个移动
                                        </Text>
                                      )}
                                  </VStack>
                                ))}
                              {moveTracks.length > 3 && (
                                <Text fontSize="xs" color="gray.400">
                                  ... 还有 {moveTracks.length - 3} 个轨迹
                                </Text>
                              )}
                            </VStack>
                          )}
                          <Text fontSize="xs" color="gray.500">
                            提示: 队列中的移动将以500毫秒间隔依次发送到后端
                          </Text>
                          {moveTracks.length > 0 && (
                            <HStack gap={2}>
                              <Button
                                size="xs"
                                colorPalette="orange"
                                onClick={cancelTrackConstruction}
                              >
                                取消构建
                              </Button>
                              <Button
                                size="xs"
                                colorPalette="red"
                                variant="outline"
                                onClick={clearAllMoveTracks}
                              >
                                清空队列
                              </Button>
                            </HStack>
                          )}
                        </VStack>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <VStack py={10}>
                    <Spinner />
                    <Text>加载地图中...</Text>
                  </VStack>
                )}
              </Card.Body>
            </Card.Root>

            {/* 回合动作历史 */}
            <Card.Root w="full">
              <Card.Header>
                <Heading size="sm">当前回合动作</Heading>
              </Card.Header>
              <Card.Body>
                <Box
                  maxH="150px"
                  overflowY="auto"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  p={3}
                  bg="gray.50"
                >
                  {turnActions.length > 0 ? (
                    <VStack align="stretch" gap={1}>
                      {turnActions.map(([playerName, action], index) => (
                        <Text key={index} fontSize="sm">
                          <Text
                            as="span"
                            fontWeight="semibold"
                            color="blue.600"
                          >
                            {playerName}
                          </Text>
                          : {action}
                        </Text>
                      ))}
                    </VStack>
                  ) : (
                    <Text fontSize="sm" color="gray.400" textAlign="center">
                      暂无动作
                    </Text>
                  )}
                </Box>
              </Card.Body>
            </Card.Root>
          </VStack>
        )}

        {gameEnded && (
          <Card.Root w="full">
            <Card.Body>
              <VStack align="center" justify="center" py={20}>
                <Text fontSize="3xl">🎉</Text>
                <Text fontSize="xl" fontWeight="semibold">
                  游戏结束！
                </Text>
                <Text fontSize="sm" color="gray.500">
                  即将返回房间...
                </Text>
                <Button mt={4} onClick={handleBackToRoom} colorPalette="blue">
                  立即返回房间
                </Button>
              </VStack>
            </Card.Body>
          </Card.Root>
        )}
      </VStack>
    </Box>
  );
};

export default GamePage;

-- 添加UNIQUE约束到username字段
CREATE UNIQUE INDEX idx_users_username ON users(username);

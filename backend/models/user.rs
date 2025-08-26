use diesel::prelude::*;
use serde::{Serialize, Deserialize};
use crate::schema::users;

// 1. User 结构体 - 用于查询数据库
#[derive(Queryable, Selectable, Serialize)]
#[diesel(table_name = users)]
pub struct User {
    pub id: String,  // 匹配数据库字段名
    pub username: String,
}

// 2. NewUser 结构体 - 用于插入数据库
#[derive(Insertable)]
#[diesel(table_name = users)]
pub struct NewUser<'a> {
    pub id: &'a str,  // 匹配数据库字段名
    pub username: &'a str,
}

// 3. UserInput 结构体 - 用于接收前端数据
#[derive(Deserialize)]
pub struct UserInput {
    pub user_id: String,  // 前端发送的字段名
    pub username: String,
}
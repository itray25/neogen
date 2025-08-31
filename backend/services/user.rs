use actix_web::{web, get, post, HttpResponse};
use diesel::prelude::*;
use crate::models::user::{User, NewUser,UserInput};
use diesel::r2d2::{self, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use serde::Deserialize;

// 定义数据库连接池类型别名
pub type DbPool = r2d2::Pool<ConnectionManager<SqliteConnection>>;

#[derive(Deserialize)]
pub struct UserIdQuery {
    user_id: String,  // 改为字符串
}

#[post("")]
pub async fn create_user(
    pool: web::Data<DbPool>,
    user_input: web::Json<UserInput>,
) -> Result<HttpResponse, actix_web::Error> {
    
    let user = web::block(move || {
        let mut conn = pool.get().expect("couldn't get db connection from pool");
        
        // 首先检查user_id是否已存在
        match crate::schema::users::table.filter(crate::schema::users::id.eq(&user_input.user_id)).first::<User>(&mut conn) {
            Ok(_) => {
                return Err(diesel::result::Error::DatabaseError(
                    diesel::result::DatabaseErrorKind::UniqueViolation,
                    Box::new("用户ID已存在".to_string())
                ));
            }
            Err(diesel::NotFound) => {
                // 用户ID不存在，继续检查用户名
            }
            Err(e) => return Err(e),
        }
        
        // 检查用户名是否包含禁用内容
        if user_input.username.to_lowercase().contains("ek") {
            return Err(diesel::result::Error::DatabaseError(
                diesel::result::DatabaseErrorKind::CheckViolation,
                Box::new("用户名包含禁用内容".to_string())
            ));
        }
        
        // 检查username是否已存在
        match crate::schema::users::table.filter(crate::schema::users::username.eq(&user_input.username)).first::<User>(&mut conn) {
            Ok(_) => {
                return Err(diesel::result::Error::DatabaseError(
                    diesel::result::DatabaseErrorKind::UniqueViolation,
                    Box::new("用户名已存在".to_string())
                ));
            }
            Err(diesel::NotFound) => {
                // 用户名不存在，可以创建
            }
            Err(e) => return Err(e),
        }
        
        // 将 UserInput 转换为 NewUser
        let new_user = NewUser {
            id: &user_input.user_id,  // 前端的user_id字段映射到数据库的id字段
            username: &user_input.username,
        };

        diesel::insert_into(crate::schema::users::table)
            .values(&new_user)
            .get_result::<User>(&mut conn)
    })
    .await?;

    match user {
        Ok(user) => Ok(HttpResponse::Ok().json(user)),
        Err(diesel::result::Error::DatabaseError(diesel::result::DatabaseErrorKind::UniqueViolation, info)) => {
            let error_message = info.message();
            if error_message.contains("用户ID已存在") {
                Ok(HttpResponse::Conflict().json(serde_json::json!({
                    "error": "用户ID已存在",
                    "message": "该用户ID已被使用，请选择其他ID"
                })))
            } else if error_message.contains("用户名已存在") {
                Ok(HttpResponse::Conflict().json(serde_json::json!({
                    "error": "用户名已存在", 
                    "message": "该用户名已被使用，请选择其他用户名"
                })))
            } else {
                Ok(HttpResponse::Conflict().json(serde_json::json!({
                    "error": "数据冲突",
                    "message": "用户ID或用户名已存在"
                })))
            }
        }
        Err(diesel::result::Error::DatabaseError(diesel::result::DatabaseErrorKind::CheckViolation, info)) => {
            let error_message = info.message();
            if error_message.contains("用户名包含禁用内容") {
                Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "用户名不符合规范",
                    "message": "用户名包含禁用内容，请选择其他用户名"
                })))
            } else {
                Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "数据验证失败",
                    "message": "输入数据不符合要求"
                })))
            }
        }
        Err(_) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "服务器错误",
            "message": "创建用户时发生内部错误"
        }))),
    }
}

// 获取用户的 Handler (使用查询参数)
#[get("")]
pub async fn get_user(
    pool: web::Data<DbPool>,
    query: web::Query<UserIdQuery>,
) -> Result<HttpResponse, actix_web::Error> {
    let user_id = query.user_id.clone();  // 克隆字符串以获得所有权
    let user_id_for_error = user_id.clone();  // 为错误信息再克隆一份

    let user = web::block(move || {
        let mut conn = pool.get().expect("couldn't get db connection from pool");
        crate::schema::users::table.filter(crate::schema::users::id.eq(user_id)).first::<User>(&mut conn)
    })
    .await?;

    match user {
        Ok(user) => Ok(HttpResponse::Ok().json(user)),
        Err(diesel::NotFound) => {
            Ok(HttpResponse::NotFound().body(format!("No user found with ID: {}", user_id_for_error)))
        }
        Err(_) => Ok(HttpResponse::InternalServerError().finish()),
    }
}

// 将用户服务的路由组织起来
pub fn endpoints(cfg: &mut web::ServiceConfig) {
    cfg.service(create_user).service(get_user);
}
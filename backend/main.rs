extern crate diesel;
use actix_files::Files;
use actix_web::{App, HttpServer, web};
use actix_web::middleware::{Compress, Logger, TrailingSlash, NormalizePath};
use actix_web::web::Data;
use actix_cors::Cors;
use create_rust_app::AppConfig;
use crate::services::ws;
// 导入用户服务的 DbPool 类型
use crate::services::user::DbPool;
mod services;
mod models;
mod schema;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    #[cfg(debug_assertions)] create_rust_app::setup_development().await;
    let app_data = create_rust_app::setup();
    let game_server = ws::create_game_server();
    simple_logger::init_with_env().unwrap();
    
    // 创建用户服务专用的 SQLite 连接池
    use diesel::r2d2::{self, ConnectionManager};
    use diesel::sqlite::SqliteConnection;
    
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://database.db".to_string());
    
    let manager = ConnectionManager::<SqliteConnection>::new(database_url);
    let user_db_pool: DbPool = r2d2::Pool::builder()
        .build(manager)
        .expect("Failed to create user database pool");
    
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .supports_credentials();

        let mut app = App::new()
            .wrap(cors)
            .wrap(Compress::default())
            .wrap(NormalizePath::new(TrailingSlash::MergeOnly))
            .wrap(Logger::default());

        app = app.app_data(Data::new(app_data.database.clone()));
        app = app.app_data(Data::new(AppConfig {
            app_url: std::env::var("APP_URL").unwrap(),
        }));
        app = app.app_data(Data::new(game_server.clone()));
        
        // 添加用户服务专用的数据库连接池
        app = app.app_data(Data::new(user_db_pool.clone()));

        // API 路由
        let mut api_scope = web::scope("/api");
        // 使用 endpoints 函数来注册用户路由
        api_scope = api_scope.service(
            web::scope("/users").configure(services::user::endpoints)
        );
        // 注册 getRooms 路由
        api_scope = api_scope.service(services::get_rooms::get_rooms);
        // 注册 createRoom 路由
        api_scope = api_scope.service(services::create_room::create_room);
        app = app.service(api_scope);
        
        // WebSocket 路由
        app = app.route("/global_ws", web::get().to(ws::global_websocket_handler)); // 全局WebSocket（推荐使用）
        // 注意：旧的房间专用WebSocket已被弃用，请使用全局WebSocket
        
        // 静态文件服务 (开发模式下)
        #[cfg(debug_assertions)]
        {
            app = app.service(Files::new("/images", "frontend/public").show_files_listing());
        }
        
        // 生产模式下的静态文件服务
        #[cfg(not(debug_assertions))]
        {
            app = app.service(Files::new("/images", "frontend/dist/images").show_files_listing());
            app = app.service(Files::new("/assets", "frontend/dist/assets").show_files_listing());
            app = app.service(Files::new("/pwa.json", "frontend/dist/pwa.json"));
            app = app.service(Files::new("/robots.txt", "frontend/dist/robots.txt"));
            // 只为根路径提供 index.html，不要捕获所有路径
            app = app.route("/", web::get().to(|| async {
                actix_files::NamedFile::open("frontend/dist/index.html")
            }));
        }
        
        // 默认路由 - 渲染前端页面 (这是关键!)
        app = app.default_service(web::get().to(create_rust_app::render_views));
        
        app
    }).bind("0.0.0.0:3000")?.run().await
}
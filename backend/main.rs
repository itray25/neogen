extern crate diesel;

use actix_files::Files;
use actix_web::{App, HttpServer, web};
use actix_web::middleware::{Compress, Logger, TrailingSlash, NormalizePath};
use actix_web::web::Data;
use create_rust_app::AppConfig;
use crate::services::ws;
mod schema;
mod services;
mod models;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    #[cfg(debug_assertions)] create_rust_app::setup_development().await;
    let app_data = create_rust_app::setup();
    let game_server = ws::create_game_server();
    simple_logger::init_with_env().unwrap();
    
    HttpServer::new(move || {
        let mut app = App::new()
            .wrap(Compress::default())
            .wrap(NormalizePath::new(TrailingSlash::MergeOnly))
            .wrap(Logger::default());

        app = app.app_data(Data::new(app_data.database.clone()));
        app = app.app_data(Data::new(AppConfig {
            app_url: std::env::var("APP_URL").unwrap(),
        }));
        app = app.app_data(Data::new(game_server.clone()));

        // API 路由
        let mut api_scope = web::scope("/api");
        api_scope = api_scope.service(services::todo::endpoints(web::scope("/todos")));
        app = app.service(api_scope);
        
        // WebSocket 路由
        app = app.route("/ws", web::get().to(ws::websocket_handler));
        
        // 静态文件服务 (开发模式下)
        #[cfg(debug_assertions)]
        {
            app = app.service(Files::new("/images", "frontend/public").show_files_listing());
        }
        
        // 生产模式下的静态文件服务
        #[cfg(not(debug_assertions))]
        {
            app = app.service(Files::new("/images", "frontend/dist/images").show_files_listing());
            app = app.service(Files::new("/", "frontend/dist").index_file("index.html"));
        }
        
        // 默认路由 - 渲染前端页面 (这是关键!)
        app = app.default_service(web::get().to(create_rust_app::render_views));
        
        app
    }).bind("0.0.0.0:3000")?.run().await
}
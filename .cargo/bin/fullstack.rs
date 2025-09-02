mod dsync;
mod tsync;

pub fn main() {
    // 仅在调试模式下运行开发服务器
    #[cfg(debug_assertions)]
    {
        if !create_rust_app::net::is_port_free(21012) {
            println!("========================================================");
            println!(" ViteJS (the frontend compiler/bundler) needs to run on");
            println!(" port 21012 but it seems to be in use.");
            println!("========================================================");
            panic!("Port 21012 is taken but is required for development!")
        }

        let project_dir = env!("CARGO_MANIFEST_DIR");

        dsync::main();
        tsync::main();

        create_rust_app::dev::run_server(project_dir);
    }
    
    // 在发布模式下，提供替代方案
    #[cfg(not(debug_assertions))]
    {
        println!("fullstack开发服务器仅在调试模式下可用。");
        println!("请使用 'cargo run --bin backend' 启动后端服务器。");
        println!("并使用 'npm run dev' 在frontend目录中启动前端开发服务器。");
    }
}

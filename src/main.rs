//! Lunar Landing Site Navigator — NASA Space Apps 2026 (Rzeszow).
//!
//! `cargo run` then open http://localhost:3000
//! Env: PORT (3000), KERNEL_DIR (data/raw/kernels), DEM_DIR (data/raw/dem), SITES (data/sites.json)

mod api;
mod dem;
mod ephem;
mod horizon;
mod metrics;
mod site;

use std::sync::Arc;

use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let kernel_dir = env_or("KERNEL_DIR", "data/raw/kernels");
    let dem_dir = env_or("DEM_DIR", "data/raw/dem");
    let sites_path = env_or("SITES", "data/sites.json");
    let port = env_or("PORT", "3000");

    let ephem = ephem::Ephem::load(&kernel_dir).map_err(|e| {
        format!(
            "cannot load kernels from {kernel_dir} ({e}). Expected {:?}, see docs/RESEARCH.md TL;DR",
            ephem::KERNELS
        )
    })?;
    let state = Arc::new(api::AppState {
        ephem,
        sites: site::load_sites(&sites_path)?,
        dem_products: dem::available_products(&dem_dir),
    });
    println!(
        "loaded {} sites, DEM products: {:?}",
        state.sites.len(),
        state.dem_products
    );

    let app = api::router(state)
        .fallback_service(ServeDir::new("web"))
        .layer(CorsLayer::permissive());

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("Lunar Landing Site Navigator on http://localhost:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}

// Keeps the Windows release build from opening a console window next to the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pack137_news_builder_lib::run();
}

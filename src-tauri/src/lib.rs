//! Desktop wrapper for the Pack 137 News Builder.
//!
//! The wrapper only hosts the web build in the system web view. It adds no commands, no plugins
//! and no capabilities, so the page can call nothing outside itself. Three things need Rust:
//!
//! 1. Downloads. A web view does not pick a save place by itself, so every download goes to the
//!    person's Downloads folder (ADR 0004, "Desktop and Android wrappers", point 2).
//! 2. Navigation. The window may only show the app's own pages. Everything else is refused.
//! 3. Permissions. The page asks for none, so every request is refused.

use std::path::{Path, PathBuf};

use tauri::{
    webview::{DownloadEvent, NewWindowResponse, PermissionResponse, WebviewWindowBuilder},
    Manager, Url,
};

/// True for the origin Tauri serves the bundled app from: `tauri://localhost` on macOS and Linux,
/// `http://tauri.localhost` on Windows and Android. In a dev run (`tauri dev`) the Vite dev server
/// on localhost is allowed as well. A release build has no such branch.
fn is_app_origin(url: &Url) -> bool {
    let app_page = match url.scheme() {
        "tauri" => url.host_str() == Some("localhost") && url.port().is_none(),
        "http" | "https" => url.host_str() == Some("tauri.localhost") && url.port().is_none(),
        _ => false,
    };
    let dev_server = cfg!(dev) && url.scheme() == "http" && url.host_str() == Some("localhost");
    app_page || dev_server
}

/// A `blob:` address belongs to the app when the origin it carries is the app's own, for example
/// `blob:tauri://localhost/<uuid>`. Download draft and Shrink a photo make these.
fn is_app_blob(url: &Url) -> bool {
    url.scheme() == "blob" && Url::parse(url.path()).is_ok_and(|inner| is_app_origin(&inner))
}

/// The pages the window may show. The sandboxed preview frames use `about:srcdoc`.
fn allow_navigation(url: &Url) -> bool {
    is_app_origin(url)
        || is_app_blob(url)
        || url.as_str() == "about:blank"
        || url.as_str() == "about:srcdoc"
}

/// Reduces a name the page suggested to a plain file name: no folders, no characters Windows
/// refuses, no leading or trailing dots and spaces, no reserved device names, a sane length.
fn sanitize_file_name(suggested: &str) -> String {
    // Take the part after the last separator of either kind, whatever the platform.
    let last = suggested.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = last
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let cleaned: String = cleaned.chars().take(120).collect();

    let stem = cleaned.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if cleaned.is_empty() {
        "download".to_string()
    } else if reserved {
        format!("_{cleaned}")
    } else {
        cleaned
    }
}

/// Picks `name`, or `name (1).ext`, `name (2).ext` and so on, the way browsers do, so a download
/// never writes over an earlier file.
fn free_destination(dir: &Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let as_path = Path::new(file_name);
    let stem = as_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    let ext = as_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    for n in 1..10_000 {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
}

/// Sends a download to the Downloads folder, or the home folder when there is none.
/// Returns false (refuses) for anything that is not one of the app's own blob addresses.
fn on_download<R: tauri::Runtime>(webview: tauri::Webview<R>, event: DownloadEvent<'_>) -> bool {
    if let DownloadEvent::Requested { url, destination } = event {
        if !is_app_blob(&url) {
            return false;
        }
        let paths = webview.path();
        let dir = paths
            .download_dir()
            .or_else(|_| paths.home_dir())
            .unwrap_or_else(|_| PathBuf::from("."));
        let suggested = destination
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download");
        *destination = free_destination(&dir, &sanitize_file_name(suggested));
    }
    true
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // The window is described in tauri.conf.json with "create": false, and built here so
            // the handlers below can be attached.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("tauri.conf.json has no window labelled main")?;
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_navigation(allow_navigation)
                .on_new_window(|_url, _features| NewWindowResponse::Deny)
                .on_permission_request(|_webview, _kind| PermissionResponse::Deny)
                .on_download(on_download)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the Pack 137 News Builder could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn allows_only_the_app_origin_and_inert_frames() {
        assert!(allow_navigation(&url("tauri://localhost/index.html")));
        assert!(allow_navigation(&url("http://tauri.localhost/")));
        assert!(allow_navigation(&url("https://tauri.localhost/index.html")));
        assert!(allow_navigation(&url("about:blank")));
        assert!(allow_navigation(&url("about:srcdoc")));
        assert!(allow_navigation(&url("blob:tauri://localhost/1234")));
        assert!(allow_navigation(&url("blob:http://tauri.localhost/1234")));
    }

    #[test]
    fn refuses_everything_else() {
        for bad in [
            "https://example.org/",
            "http://example.org/",
            "http://tauri.localhost.example.org/",
            "http://tauri.localhost:8080/",
            "https://tauri.localhost@example.org/",
            "tauri://example.org/",
            "file:///etc/passwd",
            "data:text/html,hi",
            "javascript:alert(1)",
            "blob:https://example.org/1234",
            "blob:null/1234",
            "about:config",
            "ftp://tauri.localhost/",
        ] {
            assert!(!allow_navigation(&url(bad)), "{bad} should be refused");
        }
    }

    #[test]
    fn file_names_become_plain() {
        assert_eq!(sanitize_file_name("pack137-draft.json"), "pack137-draft.json");
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("C:\\Windows\\evil.exe"), "evil.exe");
        assert_eq!(sanitize_file_name("a<b>:c|d?.json"), "a_b__c_d_.json");
        assert_eq!(sanitize_file_name("  ..hidden. "), "hidden");
        assert_eq!(sanitize_file_name(""), "download");
        assert_eq!(sanitize_file_name("../"), "download");
        assert_eq!(sanitize_file_name("nul.txt"), "_nul.txt");
        assert_eq!(sanitize_file_name("COM1"), "_COM1");
        assert_eq!(sanitize_file_name("con\u{0}trol.json"), "control.json");
        assert!(sanitize_file_name(&"x".repeat(500)).len() <= 120);
    }

    #[test]
    fn taken_names_get_a_number_before_the_extension() {
        let dir = std::env::temp_dir().join(format!("p137-dl-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = free_destination(&dir, "draft.json");
        assert_eq!(first, dir.join("draft.json"));
        std::fs::write(&first, "a").unwrap();
        let second = free_destination(&dir, "draft.json");
        assert_eq!(second, dir.join("draft (1).json"));
        std::fs::write(&second, "b").unwrap();
        assert_eq!(free_destination(&dir, "draft.json"), dir.join("draft (2).json"));
        std::fs::write(dir.join("plain"), "c").unwrap();
        assert_eq!(free_destination(&dir, "plain"), dir.join("plain (1)"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

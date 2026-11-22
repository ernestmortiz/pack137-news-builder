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

/// The dev server `tauri dev` starts (see `beforeDevCommand` in tauri.conf.json).
const DEV_PORT: u16 = 5173;

/// The kinds of file the app saves: draft files and shrunk photos. Anything else is refused.
const DOWNLOAD_EXTENSIONS: [&str; 3] = ["json", "jpg", "jpeg"];

/// True for the one origin Tauri serves the bundled app from on this platform:
/// `http://tauri.localhost` on Windows, `tauri://localhost` on macOS and Linux. The other forms
/// are not served by Tauri there and could reach the network or another program, so they are
/// refused. In a dev run (`tauri dev`) the Vite dev server is allowed as well; a release build
/// has no such branch.
fn is_app_origin(url: &Url) -> bool {
    is_app_origin_on(url, cfg!(windows)) || is_dev_server(url)
}

fn is_app_origin_on(url: &Url, windows: bool) -> bool {
    let (scheme, host) = if windows {
        ("http", "tauri.localhost")
    } else {
        ("tauri", "localhost")
    };
    url.scheme() == scheme
        && url.host_str() == Some(host)
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

fn is_dev_server(url: &Url) -> bool {
    cfg!(dev)
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(DEV_PORT)
}

/// A `blob:` address belongs to the app when the origin it carries is the app's own, for example
/// `blob:tauri://localhost/<uuid>`. Download draft and Shrink a photo make these, and the web
/// views treat the download link as a navigation first, so it has to be allowed (without it
/// Download draft fails). Such a document keeps the app's Content Security Policy; the smoke
/// test checks that on Linux.
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

/// Reduces a name the page suggested to a plain file name the app could have made: the part
/// after the last folder separator, only letters, digits, spaces and `-_.()` (anything else,
/// including invisible and right-to-left marks, becomes `_`), cut to 120 characters, no leading
/// or trailing dots and spaces, and not a name Windows reserves for devices. Returns None unless
/// the name ends in one of DOWNLOAD_EXTENSIONS.
fn sanitize_file_name(suggested: &str) -> Option<String> {
    let last = suggested.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = last
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || " -_.()".contains(c) {
                c
            } else {
                '_'
            }
        })
        .take(120)
        .collect();
    let cleaned = cleaned
        .trim_matches(|c: char| c == '.' || c == ' ')
        .to_string();

    let extension = Path::new(&cleaned)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())?;
    if !DOWNLOAD_EXTENSIONS.contains(&extension.as_str()) {
        return None;
    }

    let stem = cleaned
        .split('.')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        Some(format!("_{cleaned}"))
    } else {
        Some(cleaned)
    }
}

/// True when nothing, not even a broken link, has this name.
fn is_free(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_err()
}

/// Picks `name`, or `name (1).ext`, `name (2).ext` and so on, the way browsers do, so a download
/// never writes over an earlier file. None if every name up to 9999 is taken.
fn free_destination(dir: &Path, file_name: &str) -> Option<PathBuf> {
    let first = dir.join(file_name);
    if is_free(&first) {
        return Some(first);
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
    (1..10_000)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|candidate| is_free(candidate))
}

/// Sends a download to the Downloads folder, or the home folder when there is none. Refuses
/// anything that is not one of the app's own blob addresses, any file type the app does not
/// make, and the download altogether when there is no folder or free name to use.
fn on_download<R: tauri::Runtime>(webview: tauri::Webview<R>, event: DownloadEvent<'_>) -> bool {
    if let DownloadEvent::Requested { url, destination } = event {
        if !is_app_blob(&url) {
            return false;
        }
        let paths = webview.path();
        let Ok(dir) = paths.download_dir().or_else(|_| paths.home_dir()) else {
            return false;
        };
        let suggested = destination
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let Some(name) = sanitize_file_name(suggested) else {
            return false;
        };
        let Some(path) = free_destination(&dir, &name) else {
            return false;
        };
        *destination = path;
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
    fn each_platform_allows_only_its_own_app_origin() {
        assert!(is_app_origin_on(&url("http://tauri.localhost/"), true));
        assert!(is_app_origin_on(
            &url("http://tauri.localhost/index.html"),
            true
        ));
        assert!(!is_app_origin_on(&url("https://tauri.localhost/"), true));
        assert!(!is_app_origin_on(&url("tauri://localhost/"), true));

        assert!(is_app_origin_on(
            &url("tauri://localhost/index.html"),
            false
        ));
        assert!(!is_app_origin_on(&url("http://tauri.localhost/"), false));
        assert!(!is_app_origin_on(&url("https://tauri.localhost/"), false));

        for windows in [true, false] {
            for bad in [
                "http://tauri.localhost:8080/",
                "http://user@tauri.localhost/",
                "tauri://user:pw@localhost/",
                "http://tauri.localhost.example.org/",
                "tauri://example.org/",
            ] {
                assert!(
                    !is_app_origin_on(&url(bad), windows),
                    "{bad} on windows={windows}"
                );
            }
        }
    }

    #[test]
    fn allows_the_app_origin_and_inert_frames() {
        let home = if cfg!(windows) {
            "http://tauri.localhost/"
        } else {
            "tauri://localhost/index.html"
        };
        assert!(allow_navigation(&url(home)));
        assert!(allow_navigation(&url(&format!("blob:{home}1234"))));
        assert!(allow_navigation(&url("about:blank")));
        assert!(allow_navigation(&url("about:srcdoc")));
    }

    #[test]
    fn refuses_everything_else() {
        for bad in [
            "https://example.org/",
            "http://example.org/",
            "https://tauri.localhost/",
            "http://tauri.localhost.example.org/",
            "https://tauri.localhost@example.org/",
            "http://localhost:3000/",
            "file:///etc/passwd",
            "data:text/html,hi",
            "javascript:alert(1)",
            "blob:https://example.org/1234",
            "blob:null/1234",
            "about:config",
            "about:blank?x",
            "ftp://tauri.localhost/",
        ] {
            assert!(!allow_navigation(&url(bad)), "{bad} should be refused");
        }
    }

    #[test]
    fn file_names_become_plain() {
        let ok = |s: &str| sanitize_file_name(s);
        assert_eq!(
            ok("pack137-letter-2026-12.json").as_deref(),
            Some("pack137-letter-2026-12.json")
        );
        assert_eq!(
            ok("Pinewood derby-letter.jpg").as_deref(),
            Some("Pinewood derby-letter.jpg")
        );
        assert_eq!(ok("photo.JPEG").as_deref(), Some("photo.JPEG"));
        assert_eq!(ok("../../etc/passwd.json").as_deref(), Some("passwd.json"));
        assert_eq!(ok("C:\\Windows\\draft.json").as_deref(), Some("draft.json"));
        assert_eq!(ok("a<b>:c|d?.json").as_deref(), Some("a_b__c_d_.json"));
        assert_eq!(ok("  ..hidden.json ").as_deref(), Some("hidden.json"));
        assert!(ok(".json").is_none(), "nothing but an extension is refused");
        assert_eq!(ok("nul.json").as_deref(), Some("_nul.json"));
        assert_eq!(ok("CON .json").as_deref(), Some("_CON .json"));
        assert_eq!(ok("COM1.jpg").as_deref(), Some("_COM1.jpg"));
        assert_eq!(ok("con\u{0}trol.json").as_deref(), Some("con_trol.json"));
        // A right-to-left mark cannot disguise the extension.
        assert_eq!(
            ok("draft\u{202e}gpj.json").as_deref(),
            Some("draft_gpj.json")
        );
        assert!(
            ok(&format!("{}.json", "x".repeat(500))).is_none(),
            "cut names lose the extension"
        );
    }

    #[test]
    fn file_types_the_app_does_not_make_are_refused() {
        for bad in [
            "Open me.command",
            "setup.exe",
            "draft.json.exe",
            "link.lnk",
            "script.scpt",
            "page.html",
            "noextension",
            "",
            "../",
            "draft\u{202e}nosj.exe",
        ] {
            assert!(
                sanitize_file_name(bad).is_none(),
                "{bad:?} should be refused"
            );
        }
    }

    #[test]
    fn taken_names_get_a_number_before_the_extension() {
        let dir = std::env::temp_dir().join(format!("p137-dl-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = free_destination(&dir, "draft.json").unwrap();
        assert_eq!(first, dir.join("draft.json"));
        std::fs::write(&first, "a").unwrap();
        let second = free_destination(&dir, "draft.json").unwrap();
        assert_eq!(second, dir.join("draft (1).json"));
        std::fs::write(&second, "b").unwrap();
        assert_eq!(
            free_destination(&dir, "draft.json").unwrap(),
            dir.join("draft (2).json")
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_broken_link_counts_as_taken() {
        let dir = std::env::temp_dir().join(format!("p137-dl-link-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::os::unix::fs::symlink(dir.join("nowhere"), dir.join("draft.json")).unwrap();
        assert_eq!(
            free_destination(&dir, "draft.json").unwrap(),
            dir.join("draft (1).json")
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

use std::path::{Path, PathBuf};

use crate::app_config::AppType;
use crate::codex_config::get_codex_auth_path;
use crate::config::get_claude_settings_path;
use crate::error::AppError;
use crate::gemini_config::get_gemini_dir;

pub(crate) fn validate_prompt_content(_app: &AppType, _content: &str) -> Result<(), AppError> {
    Ok(())
}

/// 返回指定应用所使用的提示词文件路径。
pub fn prompt_file_path(app: &AppType) -> Result<PathBuf, AppError> {
    if matches!(app, AppType::ClaudeDesktop) {
        return Err(AppError::localized(
            "app.prompts_unsupported",
            "当前应用暂不支持 Prompts",
            "This app does not support Prompts",
        ));
    }

    let base_dir: PathBuf = match app {
        AppType::Claude => get_base_dir_with_fallback(get_claude_settings_path(), ".claude")?,
        AppType::Codex => get_base_dir_with_fallback(get_codex_auth_path(), ".codex")?,
        AppType::Gemini => get_gemini_dir(),
        AppType::GrokBuild => crate::grok_config::get_grok_config_dir(),
        AppType::ClaudeDesktop => unreachable!("handled above"),
    };

    let filename = match app {
        AppType::Claude => "CLAUDE.md",
        AppType::Codex | AppType::GrokBuild => "AGENTS.md",
        AppType::Gemini => "GEMINI.md",
        AppType::ClaudeDesktop => unreachable!("handled above"),
    };

    Ok(base_dir.join(filename))
}

/// 把用户主目录前缀换成 `~`，给界面显示用（复制路径仍用完整路径）。
pub fn display_path(path: &Path) -> String {
    display_path_with_home(path, &crate::config::get_home_dir())
}

fn display_path_with_home(path: &Path, home: &Path) -> String {
    match path.strip_prefix(home) {
        Ok(rest) if rest.as_os_str().is_empty() => "~".to_string(),
        Ok(rest) => format!("~{}{}", std::path::MAIN_SEPARATOR, rest.display()),
        Err(_) => path.display().to_string(),
    }
}

fn get_base_dir_with_fallback(
    primary_path: PathBuf,
    fallback_dir: &str,
) -> Result<PathBuf, AppError> {
    primary_path
        .parent()
        .map(|p| p.to_path_buf())
        .or_else(|| dirs::home_dir().map(|h| h.join(fallback_dir)))
        .ok_or_else(|| {
            AppError::localized(
                "home_dir_not_found",
                format!("无法确定 {fallback_dir} 配置目录：用户主目录不存在"),
                format!("Cannot determine {fallback_dir} config directory: user home not found"),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_path_shortens_the_home_prefix_only() {
        let home = Path::new("/Users/me");
        let sep = std::path::MAIN_SEPARATOR;
        assert_eq!(
            display_path_with_home(&home.join(".codex").join("AGENTS.md"), home),
            format!("~{sep}.codex{sep}AGENTS.md")
        );
        assert_eq!(display_path_with_home(home, home), "~");
        assert_eq!(
            display_path_with_home(Path::new("/opt/codex/AGENTS.md"), home),
            "/opt/codex/AGENTS.md"
        );
        // 只认整段目录前缀，不把 /Users/meow 当成 /Users/me 下面
        assert_eq!(
            display_path_with_home(Path::new("/Users/meow/AGENTS.md"), home),
            "/Users/meow/AGENTS.md"
        );
    }

    #[test]
    fn codex_prompt_file_uses_agents_md() {
        let path = prompt_file_path(&AppType::Codex).expect("Codex prompt path");

        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("AGENTS.md")
        );
    }

    #[test]
    fn claude_prompt_file_uses_claude_md() {
        let path = prompt_file_path(&AppType::Claude).expect("Claude prompt path");

        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("CLAUDE.md")
        );
    }
}

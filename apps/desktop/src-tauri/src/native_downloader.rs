use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDownloadResponse {
    pub data_base64: String,
    pub content_type: String,
    pub content_length: usize,
}

pub async fn download_direct_native(
    url: String,
    headers: Option<HashMap<String, String>>,
    _concurrent_parts: Option<usize>,
) -> Result<NativeDownloadResponse, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut req = client.get(&url);
    if let Some(ref h) = headers {
        for (k, v) in h {
            if let (Ok(hn), Ok(hv)) = (
                k.parse::<reqwest::header::HeaderName>(),
                reqwest::header::HeaderValue::from_str(v),
            ) {
                req = req.header(hn, hv);
            }
        }
    }

    let res = req.send().await.map_err(|e| format!("Direct download request failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Download failed with status: {}", res.status()));
    }

    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = res.bytes().await.map_err(|e| format!("Failed to read response body: {e}"))?;
    let data_base64 = STANDARD.encode(&bytes);

    Ok(NativeDownloadResponse {
        data_base64,
        content_type,
        content_length: bytes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_custom_headers_including_mixed_case() {
        let mut map = HashMap::new();
        map.insert("Referer".to_string(), "https://www.bilibili.com/".to_string());
        map.insert("User-Agent".to_string(), "TestAgent/1.0".to_string());

        for (k, v) in &map {
            let hn = k.parse::<reqwest::header::HeaderName>();
            assert!(hn.is_ok(), "HeaderName parse failed for key: {k}");
            let hv = reqwest::header::HeaderValue::from_str(v);
            assert!(hv.is_ok(), "HeaderValue parse failed for val: {v}");
        }
    }

    #[test]
    fn test_https_request() {
        tauri::async_runtime::block_on(async {
            let res = download_direct_native("https://www.baidu.com".to_string(), None, None).await;
            match res {
                Ok(resp) => {
                    assert!(resp.content_length > 0);
                    assert!(!resp.data_base64.is_empty());
                }
                Err(err) => panic!("HTTPS failed: {}", err),
            }
        });
    }
}

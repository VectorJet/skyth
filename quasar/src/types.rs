use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum QuasarRequest {
    Read {
        path: String,
    },
    Write {
        path: String,
        data: String,
    },
    Mkdir {
        path: String,
    },
    Ls {
        path: String,
    },
    Subscribe {
        pattern: String,
    },
    Publish {
        topic: String,
        payload: serde_json::Value,
    },
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum QuasarResponse {
    #[serde(rename = "response")]
    Success {
        id: String,
        result: serde_json::Value,
    },
    Error {
        id: String,
        error: String,
    },
    Event {
        topic: String,
        payload: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuasarMessage {
    pub id: String,
    #[serde(flatten)]
    pub request: QuasarRequest,
}

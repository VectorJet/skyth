use super::protocol::ResponseKind;
use crate::error::{Error, Result};

pub(super) fn error_response(e: Error) -> ResponseKind {
    ResponseKind::Error {
        message: e.to_string(),
    }
}

pub(super) fn ok_response(result: Result<()>) -> ResponseKind {
    match result {
        Ok(()) => ResponseKind::Ok,
        Err(e) => error_response(e),
    }
}

pub(super) fn base64_encode(data: Vec<u8>) -> String {
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD.encode(data)
}

pub(super) fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD
        .decode(s)
        .map_err(|e| Error::other(format!("invalid base64: {e}")))
}

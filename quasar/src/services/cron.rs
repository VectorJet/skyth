//! Cron service.
//!
//! Per spec, cron jobs land at the Generalist first, who may delegate to
//! other agents. Each cron job carries its own permission profile set at
//! creation time — there is no blanket cron permission profile.

use crate::auth::{Grant, Right};
use serde::{Deserialize, Serialize};

/// Stored cron job definition.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    /// Crontab-style expression (parsed by the runtime; opaque here).
    pub schedule: String,
    /// Agent the Generalist intends to dispatch the job to.
    pub target_agent_id: String,
    /// Permission profile applied during this job's execution. Empty
    /// vector means the job runs with the Generalist's defaults.
    pub permission_profile: Vec<Grant>,
    /// Free-form payload routed to the target agent at dispatch time.
    pub payload: serde_json::Value,
}

impl CronJob {
    pub fn new(
        schedule: impl Into<String>,
        target_agent_id: impl Into<String>,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: uuid::Uuid::now_v7().to_string(),
            schedule: schedule.into(),
            target_agent_id: target_agent_id.into(),
            permission_profile: Vec::new(),
            payload,
        }
    }

    pub fn with_grant(mut self, right: Right, scope: crate::auth::PermissionScope) -> Self {
        self.permission_profile.push(Grant {
            agent_id: self.target_agent_id.clone(),
            right,
            scope,
        });
        self
    }
}

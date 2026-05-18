//! State-transition domains Quasar owns.
//!
//! Per spec, Quasar owns state transitions for:
//!
//! - Gateway
//! - Skyth desktop
//! - Android
//! - Web
//! - CLI
//! - Agent runtime
//! - Heartbeats
//! - Cron
//! - Memory
//! - Epsilon
//!
//! Surfaces may keep live UI state, but durable transitions belong to Quasar.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StateDomain {
    Gateway,
    Desktop,
    Android,
    Web,
    Cli,
    AgentRuntime,
    Heartbeats,
    Cron,
    Memory,
    Epsilon,
}

impl StateDomain {
    pub const ALL: &'static [StateDomain] = &[
        Self::Gateway,
        Self::Desktop,
        Self::Android,
        Self::Web,
        Self::Cli,
        Self::AgentRuntime,
        Self::Heartbeats,
        Self::Cron,
        Self::Memory,
        Self::Epsilon,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Gateway => "gateway",
            Self::Desktop => "desktop",
            Self::Android => "android",
            Self::Web => "web",
            Self::Cli => "cli",
            Self::AgentRuntime => "agent_runtime",
            Self::Heartbeats => "heartbeats",
            Self::Cron => "cron",
            Self::Memory => "memory",
            Self::Epsilon => "epsilon",
        }
    }
}

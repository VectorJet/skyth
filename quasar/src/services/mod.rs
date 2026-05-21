//! Quasar service surfaces.
//!
//! - [`gateway`]    — mandatory mediation surface for all agent ↔ Quasar ops.
//! - [`heartbeat`]  — global gateway service, Generalist-only, non-delegatable.
//! - [`cron`]       — global gateway service, Generalist-first, delegatable.
//! - [`export`]     — quasardb export producing audit + Galaxy branch.
//! - [`state`]      — registry of state-transition domains Quasar owns.

pub mod cron;
pub mod export;
pub mod gateway;
pub mod heartbeat;
pub mod memory;
pub mod queue;
pub mod state;
pub mod state_store;

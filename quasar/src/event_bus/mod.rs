use anyhow::Result;
use std::sync::Arc;
use tokio::sync::broadcast;
use dashmap::DashMap;
use serde_json::Value;

#[derive(Clone)]
pub struct EventBus {
    channels: Arc<DashMap<String, broadcast::Sender<Value>>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(DashMap::new()),
        }
    }

    pub async fn publish(&self, topic: &str, payload: Value) -> Result<()> {
        let tx = self.channels.get(topic)
            .map(|c| c.value().clone())
            .unwrap_or_else(|| {
                let (tx, _) = broadcast::channel(128);
                self.channels.insert(topic.to_string(), tx.clone());
                tx
            });
        
        tx.send(payload)
            .map_err(|_| anyhow::anyhow!("subscriber dropped"))?;
        
        Ok(())
    }

    pub fn subscribe(&self, topic: &str) -> broadcast::Receiver<Value> {
        if !self.channels.contains_key(topic) {
            let (tx, _) = broadcast::channel(128);
            self.channels.insert(topic.to_string(), tx);
        }
        self.channels.get(topic).unwrap().subscribe()
    }
}
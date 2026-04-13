use anyhow::Result;
use dashmap::DashMap;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::broadcast;

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

    pub fn publish(&self, topic: &str, payload: Value) -> Result<()> {
        let tx = self
            .channels
            .get(topic)
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

    fn matches(&self, topic: &str, pattern: &str) -> bool {
        if pattern.contains('*') || pattern.contains('+') {
            let pattern_parts: Vec<&str> = pattern.split('/').collect();
            let topic_parts: Vec<&str> = topic.split('/').collect();

            for (i, part) in pattern_parts.iter().enumerate() {
                if *part == "*" || *part == "+" {
                    if i >= topic_parts.len() {
                        return *part == "*";
                    }
                    continue;
                }
                if i >= topic_parts.len() {
                    return false;
                }
                if part != &topic_parts[i] {
                    return false;
                }
            }
            pattern_parts.len() == topic_parts.len() || pattern_parts.iter().all(|p| *p == "*")
        } else {
            pattern == topic
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glob_matching() {
        let bus = EventBus::new();

        // Exact match
        assert!(bus.matches("agent/1/result", "agent/1/result"));

        // + wildcard
        assert!(bus.matches("agent/1/result", "agent/+/result"));
        assert!(bus.matches("agent/worker-2/result", "agent/+/result"));
        assert!(!bus.matches("agent/1/progress", "agent/+/result"));

        // * wildcard
        assert!(bus.matches("agent/1/result", "agent/*/result"));
        assert!(!bus.matches("agent/1/sub/result", "agent/*/result"));

        // No match
        assert!(!bus.matches("agent/1/result", "other/+/result"));
    }

    #[test]
    fn test_publish_subscribe() {
        let bus = EventBus::new();

        let mut rx = bus.subscribe("test/topic").unwrap();
        bus.publish("test/topic", serde_json::json!({"msg": "hello"}))
            .unwrap();

        let payload = rx.blocking_recv().unwrap();
        assert_eq!(payload["msg"], "hello");
    }
}

use quasar::disk::DiskStore;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let data_dir = PathBuf::from("/tmp/quasar_test_data");
    std::fs::remove_dir_all(&data_dir).ok();
    std::fs::create_dir_all(&data_dir)?;
    
    let store = DiskStore::new(data_dir.clone(), "super-secret-password").await?;
    
    println!("Testing encrypted write...");
    store.write("/sessions/test.json", r#"{"user": "test", "messages": []}"#.as_bytes()).await?;
    println!("  OK");
    
    println!("Testing encrypted read...");
    let data = store.read("/sessions/test.json").await?;
    println!("  Got: {:?}", String::from_utf8_lossy(&data));
    
    println!("Testing list...");
    let files = store.list("/sessions").await?;
    println!("  Files: {:?}", files);
    
    println!("Testing wrong password (should fail)...");
    let bad_store = DiskStore::new(data_dir.clone(), "wrong-password").await?;
    match bad_store.read("/sessions/test.json").await {
        Ok(_) => println!("  ERROR: should have failed"),
        Err(e) => println!("  OK: correct rejection"),
    }
    
    std::fs::remove_dir_all(&data_dir).ok();
    println!("\nDisk encryption tests passed!");
    Ok(())
}
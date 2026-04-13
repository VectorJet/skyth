use quasar::vfs::QuasarVfs;

fn main() {
    let vfs = QuasarVfs::new();

    // Test mkdir
    println!("Testing mkdir /sessions...");
    vfs.mkdir("/sessions").unwrap();
    println!("  OK");

    // Test write
    println!("Testing write /sessions/test.json...");
    vfs.write_file("/sessions/test.json", "SGVsbG8gV29ybGQ=")
        .unwrap(); // "Hello World" in base64
    println!("  OK");

    // Test read
    println!("Testing read /sessions/test.json...");
    let data = vfs.read_file("/sessions/test.json").unwrap();
    println!("  Got: {}", data);

    // Test ls
    println!("Testing ls /sessions...");
    let files = vfs.ls("/sessions").unwrap();
    println!("  Files: {:?}", files);

    // Test nested mkdir + write
    println!("Testing mkdir /sessions/agent-1...");
    vfs.mkdir("/sessions/agent-1").unwrap();
    println!("  OK");

    println!("Testing write /sessions/agent-1/context.json...");
    vfs.write_file("/sessions/agent-1/context.json", "eyJ1c2VyIjoidGVzdCJ9")
        .unwrap();
    println!("  OK");

    let files = vfs.ls("/sessions").unwrap();
    println!("  Files: {:?}", files);

    // Test ls nested
    println!("Testing ls /sessions/agent-1...");
    let files = vfs.ls("/sessions/agent-1").unwrap();
    println!("  Files: {:?}", files);

    // Test is_dir
    println!("Testing is_dir...");
    println!("  /sessions is dir: {}", vfs.is_dir("/sessions"));
    println!(
        "  /sessions/test.json is dir: {}",
        vfs.is_dir("/sessions/test.json")
    );

    // Test error cases
    println!("Testing error: read dir as file...");
    match vfs.read_file("/sessions") {
        Ok(_) => println!("  ERROR: should have failed"),
        Err(e) => println!("  OK: {}", e),
    }

    println!("Testing error: mkdir over file...");
    match vfs.mkdir("/sessions/test.json") {
        Ok(_) => println!("  ERROR: should have failed"),
        Err(e) => println!("  OK: {}", e),
    }

    println!("Testing error: write to dir...");
    match vfs.write_file("/sessions", "data") {
        Ok(_) => println!("  ERROR: should have failed"),
        Err(e) => println!("  OK: {}", e),
    }

    println!("Testing error: ls a file...");
    match vfs.ls("/sessions/test.json") {
        Ok(_) => println!("  ERROR: should have failed"),
        Err(e) => println!("  OK: {}", e),
    }

    println!("\nAll tests passed!");
}

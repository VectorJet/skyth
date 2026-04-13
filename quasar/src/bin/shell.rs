use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;

fn main() -> anyhow::Result<()> {
    let mut stream = UnixStream::connect("/tmp/quasard.sock")?;
    stream.set_nonblocking(false)?;

    let stdin = BufReader::new(std::io::stdin());

    println!("Quasar Shell (type 'help' for commands, 'quit' to exit)");
    println!();

    for line in stdin.lines() {
        let line = line?;
        let line = line.trim();

        if line.is_empty() {
            continue;
        }

        if line == "quit" || line == "exit" {
            break;
        }

        if line == "help" {
            println!("Commands:");
            println!("  ls <path>     - list directory");
            println!("  cat <path>    - read file");
            println!("  write <path> <data> - write file (base64)");
            println!("  mkdir <path>  - create directory");
            println!("  ping         - ping daemon");
            println!("  quit        - exit");
            println!();
            continue;
        }

        if line == "ping" {
            send(&mut stream, r#"{"id":"ping","op":"ping"}"#)?;
            let resp = recv(&mut stream)?;
            println!("{}", resp);
            continue;
        }

        let parts: Vec<&str> = line.splitn(2, ' ').collect();
        let op = parts[0];

        match op {
            "ls" => {
                let path = parts.get(1).map(|s| *s).unwrap_or("/");
                send(
                    &mut stream,
                    &serde_json::json!({"id":"ls","op":"ls","path":path}).to_string(),
                )?;
                let resp = recv(&mut stream)?;
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&resp) {
                    if let Some(files) = v.get("result").and_then(|r| r.as_array()) {
                        for f in files {
                            println!("{}", f.as_str().unwrap_or("?"));
                        }
                    } else {
                        println!("{}", resp);
                    }
                } else {
                    println!("{}", resp);
                }
            }
            "cat" => {
                let path = parts.get(1).unwrap_or(&"");
                send(
                    &mut stream,
                    &serde_json::json!({"id":"cat","op":"read","path":path}).to_string(),
                )?;
                let resp = recv(&mut stream)?;
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&resp) {
                    if let Some(data) = v.get("result").and_then(|r| r.as_str()) {
                        use base64::Engine as _;
                        let decoded = base64::engine::general_purpose::STANDARD
                            .decode(data)
                            .unwrap_or_default();
                        print!("{}", String::from_utf8_lossy(&decoded));
                    } else if let Some(err) = v.get("error") {
                        println!("Error: {}", err);
                    } else {
                        println!("{}", resp);
                    }
                } else {
                    println!("{}", resp);
                }
            }
            "write" => {
                if parts.len() < 2 {
                    println!("Usage: write <path> <data>");
                    continue;
                }
                let args: Vec<&str> = parts[1].splitn(2, ' ').collect();
                let path = args[0];
                let data = args.get(1).unwrap_or(&"");
                use base64::Engine as _;
                let encoded = base64::engine::general_purpose::STANDARD.encode(data.as_bytes());
                send(
                    &mut stream,
                    &serde_json::json!({"id":"write","op":"write","path":path,"data":encoded})
                        .to_string(),
                )?;
                let resp = recv(&mut stream)?;
                println!("{}", resp);
            }
            "mkdir" => {
                let path = parts.get(1).unwrap_or(&"");
                send(
                    &mut stream,
                    &serde_json::json!({"id":"mkdir","op":"mkdir","path":path}).to_string(),
                )?;
                let resp = recv(&mut stream)?;
                println!("{}", resp);
            }
            _ => {
                println!(
                    "Unknown command: {}. Type 'help' for available commands.",
                    op
                );
            }
        }
    }

    Ok(())
}

fn send(stream: &mut UnixStream, msg: &str) -> anyhow::Result<()> {
    stream.write_all(msg.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;
    Ok(())
}

fn recv(stream: &mut UnixStream) -> anyhow::Result<String> {
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf[..n]).trim().to_string())
}

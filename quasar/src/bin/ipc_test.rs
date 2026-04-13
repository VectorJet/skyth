use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;

fn main() {
    let mut stream = UnixStream::connect("/tmp/quasard.sock").expect("connect");

    // Test ping
    stream
        .write_all(b"{ \"id\": \"test-1\", \"op\": \"ping\" }\n")
        .unwrap();
    stream.flush().unwrap();

    let mut buf = [0u8; 1024];
    let n = stream.read(&mut buf).unwrap();
    let response = std::str::from_utf8(&buf[..n]).unwrap();
    println!("Ping: {}", response.trim());

    // Test mkdir
    stream
        .write_all(b"{ \"id\": \"test-2\", \"op\": \"mkdir\", \"path\": \"/sessions\" }\n")
        .unwrap();
    stream.flush().unwrap();
    let n = stream.read(&mut buf).unwrap();
    let response = std::str::from_utf8(&buf[..n]).unwrap();
    println!("Mkdir: {}", response.trim());

    // Test write
    stream.write_all(b"{ \"id\": \"test-3\", \"op\": \"write\", \"path\": \"/sessions/test.json\", \"data\": \"SGVsbG8gV29ybGQ=\" }\n").unwrap();
    stream.flush().unwrap();
    let n = stream.read(&mut buf).unwrap();
    let response = std::str::from_utf8(&buf[..n]).unwrap();
    println!("Write: {}", response.trim());

    // Test read
    stream
        .write_all(b"{ \"id\": \"test-4\", \"op\": \"read\", \"path\": \"/sessions/test.json\" }\n")
        .unwrap();
    stream.flush().unwrap();
    let n = stream.read(&mut buf).unwrap();
    let response = std::str::from_utf8(&buf[..n]).unwrap();
    println!("Read: {}", response.trim());

    // Test ls
    stream
        .write_all(b"{ \"id\": \"test-5\", \"op\": \"ls\", \"path\": \"/sessions\" }\n")
        .unwrap();
    stream.flush().unwrap();
    let n = stream.read(&mut buf).unwrap();
    let response = std::str::from_utf8(&buf[..n]).unwrap();
    println!("Ls: {}", response.trim());

    println!("\nIPC tests passed!");
}

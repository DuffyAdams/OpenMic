package com.openmic.tv

fun main() {
    check(ServerConfig.normalize("https://duffyadams.com/openmic/") == "https://duffyadams.com/openmic") {
        "Server URL normalization must retain a deployment subpath"
    }
    check(ServerConfig.tvPageUrl(ServerConfig.normalize("https://duffyadams.com/openmic/")!!) == "https://duffyadams.com/openmic/tv")
    check(ServerConfig.normalize("https://example.com/") == "https://example.com")
    check(ServerConfig.normalize("192.168.1.20:8000/openmic") == "http://192.168.1.20:8000/openmic")
    check(ServerConfig.normalize("example.com/openmic") == "https://example.com/openmic")
    check(ServerConfig.normalize("file:///openmic") == null)
    println("Fire TV URL normalization assertions passed")
}

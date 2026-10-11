package com.openmic.tv

import android.content.Context
import android.net.Uri

/** Where the party server lives. Stored on the device; can be preset at build time or via ADB. */
object ServerConfig {
    private const val PREFS = "openmic"
    private const val KEY_URL = "server_url"

    fun serverUrl(context: Context): String? {
        val saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_URL, null)
        return saved ?: normalize(BuildConfig.DEFAULT_SERVER_URL)
    }

    fun save(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_URL, url).apply()
    }

    fun tvPageUrl(base: String): String = "$base/tv"

    /**
     * Accepts "karaoke.example.com", "https://karaoke.example.com/", "http://192.168.1.20:8000".
     * Returns a canonical "scheme://host[:port]" (no trailing slash), or null if it isn't a URL.
     * Bare hosts default to https, except private LAN addresses, which default to http.
     */
    fun normalize(input: String?): String? {
        var text = input?.trim().orEmpty().trimEnd('/')
        if (text.isEmpty()) return null
        if (!text.contains("://")) {
            text = if (looksLocal(text)) "http://$text" else "https://$text"
        }
        val uri = Uri.parse(text)
        val scheme = uri.scheme?.lowercase()
        val host = uri.host
        if ((scheme != "http" && scheme != "https") || host.isNullOrBlank()) return null
        val port = if (uri.port != -1) ":${uri.port}" else ""
        return "$scheme://$host$port"
    }

    private fun looksLocal(hostPart: String): Boolean {
        val host = hostPart.substringBefore('/').substringBefore(':')
        return host == "localhost" || host.endsWith(".local") ||
            host.startsWith("10.") || host.startsWith("192.168.") ||
            Regex("^172\\.(1[6-9]|2\\d|3[01])\\.").containsMatchIn(host)
    }
}

package android.net

class Uri private constructor(private val value: java.net.URI) {
    companion object { fun parse(text: String): Uri = Uri(java.net.URI(text)) }
    val scheme: String? get() = value.scheme
    val host: String? get() = value.host
    val port: Int get() = value.port
    val encodedPath: String? get() = value.rawPath
    val encodedQuery: String? get() = value.rawQuery
    val encodedFragment: String? get() = value.rawFragment
    val userInfo: String? get() = value.rawUserInfo
}

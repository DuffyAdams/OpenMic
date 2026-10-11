package android.content

// Minimal storage boundary for the standalone JVM URL regression, not a device test.
open class Context {
    companion object { const val MODE_PRIVATE = 0 }
    fun getSharedPreferences(name: String, mode: Int): Preferences = Preferences()
}
class Preferences {
    fun getString(key: String, fallback: String?): String? = fallback
    fun edit(): Editor = Editor()
}
class Editor {
    fun putString(key: String, value: String): Editor = this
    fun apply() {}
}
